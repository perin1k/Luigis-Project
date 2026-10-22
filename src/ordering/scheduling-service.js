import { randomUUID } from 'node:crypto';
import { PricingError } from './catalog-service.js';
const WINDOW_MS = 20 * 60 * 1000;
const HOLD_MS = 30 * 60 * 1000;
const POLICY = 'demo-six-per-20m-v1';
const objLocalParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function parts(dtInstant) { return Object.fromEntries(objLocalParts.formatToParts(new Date(dtInstant)).map((objPart) => [objPart.type, objPart.value])); }
export function chicagoDate(dtInstant) {
  const objParts = parts(dtInstant); return `${objParts.year}-${objParts.month}-${objParts.day}`;
}
// Service hours avoid the ambiguous/missing 01:00–03:00 DST transition period.
export function localHour(strDate, intHour) {
  const numLocal = Date.parse(`${strDate}T${String(intHour).padStart(2, '0')}:00:00.000Z`);
  let numInstant = numLocal;
  for (let intPass = 0; intPass < 3; intPass++) {
    const objParts = parts(numInstant);
    const numWall = Date.parse(`${objParts.year}-${objParts.month}-${objParts.day}T${objParts.hour}:${objParts.minute}:${objParts.second}.000Z`);
    numInstant += numLocal - numWall;
  }
  return new Date(numInstant).toISOString();
}
function nextDate(strDate) { return new Date(Date.parse(`${strDate}T12:00:00.000Z`) + 86400000).toISOString().slice(0, 10); }
function iso(numInstant) { return new Date(numInstant).toISOString(); }
function conflict() { throw new PricingError('pickup_changed', 'That pickup time is no longer available. Refresh pickup times and review your selection.', 409); }

export function createSchedulingService(objDatabase, { fnNow = () => new Date().toISOString() } = {}) {
  function now() {
    const dtNow = fnNow();
    if (typeof dtNow !== 'string' || !Number.isFinite(Date.parse(dtNow)) || iso(Date.parse(dtNow)) !== dtNow) throw new Error('Invalid server clock.');
    return dtNow;
  }
  function serviceDay(strDate) {
    const objStored = objDatabase.prepare('SELECT * FROM service_days WHERE service_date=?').get(strDate);
    if (objStored) return objStored;
    const dtCloses = localHour(strDate, 23);
    return { id: `service-day:${strDate}`, service_date: strDate, timezone: 'America/Chicago', opens_at: localHour(strDate, 10), closes_at: dtCloses,
      cutoff_at: iso(Date.parse(dtCloses) - 30 * 60000), latest_pickup_at: iso(Date.parse(dtCloses) - 10 * 60000), is_closed: 0, revision: 1 };
  }
  function reservations(strDayId, dtNow) {
    return objDatabase.prepare(`SELECT b.id AS strBookingId, b.promised_at, h.reserved_units FROM capacity_holds h JOIN fulfillment_bookings b ON b.id=h.booking_id
      WHERE b.service_day_id=? AND (h.state='confirmed' OR (h.state='active' AND h.expires_at>?)) ORDER BY b.promised_at`).all(strDayId, dtNow);
  }
  function fits(arrReservations, numPromise, intPizzas) {
    const arrInstants = [...arrReservations.map((objRow) => ({ numAt: Date.parse(objRow.promised_at), intUnits: objRow.reserved_units })), { numAt: numPromise, intUnits: intPizzas }]
      .filter((objRow) => Math.abs(objRow.numAt - numPromise) < WINDOW_MS).sort((objLeft, objRight) => objLeft.numAt - objRight.numAt);
    let intLeft = 0; let intTotal = 0;
    for (let intRight = 0; intRight < arrInstants.length; intRight++) {
      intTotal += arrInstants[intRight].intUnits;
      while (arrInstants[intRight].numAt - arrInstants[intLeft].numAt >= WINDOW_MS) intTotal -= arrInstants[intLeft++].intUnits;
      if (intTotal > 6) return false;
    }
    return true;
  }
  function optionsForDay(objDay, intPizzas, dtNow) {
    if (objDay.is_closed || dtNow > objDay.cutoff_at) return [];
    const numEarliest = Math.max(Date.parse(objDay.opens_at), Math.ceil((Date.parse(dtNow) + WINDOW_MS) / 60000) * 60000);
    const numLatest = Date.parse(objDay.latest_pickup_at);
    const arrReservations = reservations(objDay.id, dtNow);
    function selection(strType, numAt) { return { strServiceDate: objDay.service_date, intRevision: objDay.revision, strSelectionType: strType, dtPromisedAt: iso(numAt) }; }
    const arrChoices = [];
    // Availability changes only when the rolling window moves past an existing promise.
    const arrCandidates = [...new Set([numEarliest, ...arrReservations.map((objRow) => Date.parse(objRow.promised_at) + WINDOW_MS)])].sort((numLeft, numRight) => numLeft - numRight);
    const numAsap = arrCandidates.find((numAt) => numAt >= numEarliest && numAt <= numLatest && fits(arrReservations, numAt, intPizzas));
    if (numAsap !== undefined) arrChoices.push(selection('ASAP', numAsap));
    for (let numAt = Date.parse(objDay.opens_at); numAt <= numLatest; numAt += WINDOW_MS) {
      if (numAt >= numEarliest && fits(arrReservations, numAt, intPizzas)) arrChoices.push(selection('scheduled', numAt));
    }
    return arrChoices;
  }
  function listOptions(intPizzas) {
    if (!Number.isSafeInteger(intPizzas) || intPizzas < 1 || intPizzas > 6) throw new PricingError('invalid_quantity', 'Choose between one and six pizzas.');
    const dtNow = now(); let strDate = chicagoDate(dtNow);
    // Bounded safety search, not an advance-booking promise. Respect stored closed/special days.
    for (let intDay = 0; intDay < 366; intDay++, strDate = nextDate(strDate)) {
      const objDay = serviceDay(strDate); const arrOptions = optionsForDay(objDay, intPizzas, dtNow);
      if (arrOptions.length) return { strTimezone: 'America/Chicago', dtCheckedAt: dtNow, arrOptions };
    }
    throw new PricingError('schedule_unavailable', 'Pickup times are unavailable. Please try again later.', 503);
  }
  function reserve(strOrderId, objSelection, intPizzas, dtNow) {
    // Called only under the order service's BEGIN IMMEDIATE write lock.
    if (!objSelection || Object.keys(objSelection).length !== 4 || !['strServiceDate','intRevision','strSelectionType','dtPromisedAt'].every((strKey) => Object.hasOwn(objSelection, strKey))
      || typeof objSelection.strServiceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(objSelection.strServiceDate) || !Number.isFinite(Date.parse(`${objSelection.strServiceDate}T12:00:00.000Z`)) || new Date(`${objSelection.strServiceDate}T12:00:00.000Z`).toISOString().slice(0,10) !== objSelection.strServiceDate || !['ASAP','scheduled'].includes(objSelection.strSelectionType)
      || !Number.isSafeInteger(objSelection.intRevision) || typeof objSelection.dtPromisedAt !== 'string'
      || !Number.isFinite(Date.parse(objSelection.dtPromisedAt)) || iso(Date.parse(objSelection.dtPromisedAt)) !== objSelection.dtPromisedAt) conflict();
    const objOffered = listOptions(intPizzas);
    const objDay = serviceDay(objSelection.strServiceDate);
    const numPromise = Date.parse(objSelection.dtPromisedAt);
    if (objOffered.arrOptions[0].strServiceDate !== objSelection.strServiceDate || objDay.is_closed || objDay.revision !== objSelection.intRevision
      || dtNow > objDay.cutoff_at || numPromise < Math.max(Date.parse(objDay.opens_at), Date.parse(dtNow) + WINDOW_MS) || numPromise > Date.parse(objDay.latest_pickup_at)
      || (objSelection.strSelectionType === 'ASAP' && objSelection.dtPromisedAt !== objOffered.arrOptions[0].dtPromisedAt)
      || (objSelection.strSelectionType === 'scheduled' && (numPromise - Date.parse(objDay.opens_at)) % WINDOW_MS !== 0)
      || !fits(reservations(objDay.id, dtNow), numPromise, intPizzas)) conflict();
    objDatabase.prepare(`UPDATE capacity_holds SET state='expired',released_at=? WHERE state='active' AND expires_at<=?`).run(dtNow, dtNow);
    objDatabase.prepare(`INSERT OR IGNORE INTO service_days (id,service_date,timezone,opens_at,closes_at,cutoff_at,latest_pickup_at,is_closed,revision) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(objDay.id,objDay.service_date,objDay.timezone,objDay.opens_at,objDay.closes_at,objDay.cutoff_at,objDay.latest_pickup_at,objDay.is_closed,objDay.revision);
    const strBookingId = randomUUID(); const strWindowId = `window:${objDay.id}:${objSelection.dtPromisedAt}`;
    objDatabase.prepare(`INSERT INTO fulfillment_bookings (id,order_id,service_day_id,selection_type,promised_at,minimum_lead_minutes,capacity_policy_reference) VALUES (?,?,?,?,?,20,?)`)
      .run(strBookingId,strOrderId,objDay.id,objSelection.strSelectionType,objSelection.dtPromisedAt,POLICY);
    objDatabase.prepare(`INSERT OR IGNORE INTO capacity_windows (id,service_day_id,starts_at,ends_at,capacity_units,policy_reference) VALUES (?,?,?,?,6,?)`)
      .run(strWindowId,objDay.id,objSelection.dtPromisedAt,iso(numPromise+WINDOW_MS),POLICY);
    const objWindow = objDatabase.prepare('SELECT id FROM capacity_windows WHERE service_day_id=? AND starts_at=? AND ends_at=?').get(objDay.id,objSelection.dtPromisedAt,iso(numPromise+WINDOW_MS));
    const dtExpiresAt = iso(Date.parse(dtNow)+HOLD_MS);
    objDatabase.prepare(`INSERT INTO capacity_holds (id,booking_id,capacity_window_id,service_day_id,reserved_units,created_at,expires_at) VALUES (?,?,?,?,?,?,?)`)
      .run(randomUUID(),strBookingId,objWindow.id,objDay.id,intPizzas,dtNow,dtExpiresAt);
  }
  function readReservation(strOrderId, dtNow = now()) {
    const objHold = objDatabase.prepare(`SELECT b.promised_at,h.expires_at,h.state FROM fulfillment_bookings b JOIN capacity_holds h ON h.booking_id=b.id WHERE b.order_id=? ORDER BY h.created_at DESC LIMIT 1`).get(strOrderId);
    if (!objHold) return null;
    return { dtPromisedAt: objHold.promised_at, dtExpiresAt: objHold.expires_at,
      strHoldState: objHold.state === 'active' && objHold.expires_at <= dtNow ? 'expired' : objHold.state };
  }
  function hasCapacity(strOrderId, dtNow) {
    const objHold = objDatabase.prepare(`SELECT b.id,b.service_day_id,b.promised_at,h.reserved_units FROM fulfillment_bookings b JOIN capacity_holds h ON h.booking_id=b.id
      WHERE b.order_id=? AND h.state='active' AND h.expires_at>?`).get(strOrderId,dtNow);
    return Boolean(objHold && fits(reservations(objHold.service_day_id,dtNow).filter((objRow)=>objRow.strBookingId!==objHold.id),Date.parse(objHold.promised_at),objHold.reserved_units));
  }
  return { listOptions, reserve, readReservation, hasCapacity, now };
}
