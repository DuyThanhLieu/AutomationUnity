import { diff } from 'deep-diff';

export function compareJson(
  stagingData: any,
  prodData: any
) {
  return diff(
    stagingData,
    prodData
  );
}