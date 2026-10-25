/** Bounded demo measurements; include errors and slow responses, never averages disguised as p95. */
export function summarizeMeasurements(arrSamples) {
  if(!Array.isArray(arrSamples)||!arrSamples.length||arrSamples.some(objRow=>
    !Number.isFinite(objRow.numMilliseconds)||objRow.numMilliseconds<0||!Number.isInteger(objRow.intStatus)))throw new Error('Complete measured samples required.');
  const arrSorted=arrSamples.map(objRow=>objRow.numMilliseconds).sort((numLeft,numRight)=>numLeft-numRight);
  return {intCount:arrSamples.length,numP95Milliseconds:arrSorted[Math.ceil(arrSorted.length*0.95)-1],
    intUnexpectedResponses:arrSamples.filter(objRow=>objRow.intStatus<200||objRow.intStatus>=300).length};
}
