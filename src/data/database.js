import { DatabaseSync } from 'node:sqlite';
import { types } from 'node:util';

/** Open a server-owned local file or isolated in-memory test database. */
export function openDatabase(strPath) {
  if (typeof strPath !== 'string' || !strPath.trim()) throw new TypeError('Database path is required.');
  const objDatabase = new DatabaseSync(strPath);
  try {
    objDatabase.exec('PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON; PRAGMA busy_timeout = 5000;');
    return objDatabase;
  } catch (objError) {
    objDatabase.close();
    throw objError;
  }
}

/** Keep synchronous work atomic and obtain the write lock before reading. */
export function runTransaction(objDatabase, fnWork) {
  if (typeof fnWork !== 'function' || types.isAsyncFunction(fnWork)) {
    throw new TypeError('Transaction work must be synchronous.');
  }
  objDatabase.exec('BEGIN IMMEDIATE');
  try {
    const objResult = fnWork();
    if (objResult && typeof objResult.then === 'function') throw new TypeError('Transaction work must be synchronous.');
    objDatabase.exec('COMMIT');
    return objResult;
  } catch (objError) {
    objDatabase.exec('ROLLBACK');
    throw objError;
  }
}
