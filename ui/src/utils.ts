import { deepClone, isNil } from '@milaboratories/helpers';
import type { AnnotationScriptUi, PObjectId } from '@platforma-sdk/model';
import { getAxisId, getRawPlatformaInstance, type PFrameHandle, type PlSelectionModel } from '@platforma-sdk/model';

export function getDefaultAnnotationScript(): AnnotationScriptUi {
  return {
    isCreated: false,
    title: 'My Annotation',
    mode: 'byClonotype',
    steps: [],
  };
}

export async function getValuesForSelectedColumns(
  selectedColumns: PlSelectionModel,
  pFrames: PFrameHandle[],
): Promise<undefined | { columnId: PObjectId; values: string[] }> {
  if (selectedColumns.selectedKeys.length === 0) return undefined;

  const pfDriver = getRawPlatformaInstance().pFrameDriver;
  if (!pfDriver) {
    throw new Error('Platforma PFrame driver is not available');
  };

  const axisId = deepClone(getAxisId(selectedColumns.axesSpec[0]));

  let selectedPFrame: undefined | PFrameHandle;
  let selectedColumnId: undefined | PObjectId;

  for (const pFrame of pFrames) {
    const columns = await pfDriver.findColumns(pFrame, {
      columnFilter: { name: ['pl7.app/label'] },
      compatibleWith: [axisId],
      strictlyCompatible: true,
    });

    if (columns.hits.length > 0) {
      selectedPFrame = pFrame;
      selectedColumnId = columns.hits[0].columnId;
      break;
    }
  }
  if (isNil(selectedColumnId) || isNil(selectedPFrame)) return undefined;

  return Promise.all(selectedColumns.selectedKeys.map((key) => {
    return pfDriver.calculateTableData(selectedPFrame, {
      src: {
        type: 'column',
        column: selectedColumnId,
      },
      filters: [{
        type: 'bySingleColumnV2',
        column: {
          type: 'axis',
          id: axisId,
        },
        predicate: {
          operator: 'Equal',
          reference: key[0] as (string | number),
        },
      }],
      sorting: [],
    });
  })).then((results) => {
    return results.map((result) => {
      return result[1].data.data[0] as string;
    });
  }).then((values) => {
    return {
      columnId: selectedColumnId,
      values,
    };
  });
}
