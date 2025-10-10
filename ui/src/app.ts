import type { Platforma, SimplifiedUniversalPColumnEntry } from '@platforma-open/milaboratories.clonotype-browser-2.model';
import { platforma } from '@platforma-open/milaboratories.clonotype-browser-2.model';
import type { AnnotationFilter, PFrameHandle, PlSelectionModel } from '@platforma-sdk/model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import AnnotationStatsPage from './components/AnnotationStatsPage.vue';
import OverlapPage from './components/OverlapPage.vue';
import PerSamplePage from './components/PerSamplePage.vue';
import { migrateUiState } from './migration';
import { processAnnotatiuoUiStateToArgs } from './model';
import { getValuesForSelectedColumns } from './utils';

export const sdkPlugin = defineApp(platforma as Platforma, (app) => {
  migrateUiState(app.model.ui);
  processAnnotatiuoUiStateToArgs(
    () => app.model.ui.annotationScript,
    () => app.model.args.annotationScript,
  );

  const selectedColumns = ref({
    axesSpec: [],
    selectedKeys: [],
  } satisfies PlSelectionModel);

  const isAnnotationModalOpen = ref(false);
  const hasSelectedColumns = computed(() => {
    return selectedColumns.value.selectedKeys.length > 0;
  });
  const filterColumns = computed((): SimplifiedUniversalPColumnEntry[] => {
    const { bySampleAndClonotypeColumns, byClonotypeColumns } = app.model.outputs;

    return app.model.args.annotationScript.mode === 'bySampleAndClonotype'
      ? [...(bySampleAndClonotypeColumns?.columns ?? []), ...(byClonotypeColumns?.columns ?? [])]
      : (byClonotypeColumns?.columns ?? []);
  });

  const isRunAllowed = computed(() => {
    const { annotationScript } = app.model.args;
    if (annotationScript.mode !== 'bySampleAndClonotype') {
      return true;
    }

    let foundTwoAxes = false;

    function checkFilters(filter: AnnotationFilter) {
      if (foundTwoAxes || !filter) {
        return;
      }

      function checkColumn(column: any) {
        if (typeof column === 'string') {
          try {
            const decodedColumn = JSON.parse(column);
            let axes = [];
            if (decodedColumn && typeof decodedColumn === 'object') {
              if (decodedColumn.axes) {
                axes = decodedColumn.axes;
              } else if (decodedColumn.source && decodedColumn.source.axes) {
                axes = decodedColumn.source.axes;
              }
            }
            if (Array.isArray(axes) && axes.length === 2) {
              foundTwoAxes = true;
            }
          } catch (e) {
            // Not a JSON string, ignore
          }
        }
      }

      if (filter.type) {
        if (filter.type === 'or' || filter.type === 'and') {
          if ('filters' in filter && filter.filters) {
            for (const f of filter.filters) {
              checkFilters(f);
              if (foundTwoAxes) return;
            }
          }
        } else if (filter.type === 'not') {
          if ('filter' in filter && filter.filter) {
            checkFilters(filter.filter);
          }
        } else if (filter.type === 'numericalComparison') {
          if ('lhs' in filter && filter.lhs) {
            checkColumn(filter.lhs);
            if (foundTwoAxes) return;
          }
          if ('rhs' in filter && filter.rhs) {
            checkColumn(filter.rhs);
          }
        } else if (filter.type === 'isNA' || filter.type === 'pattern') {
          if ('column' in filter && filter.column) {
            checkColumn(filter.column);
          }
        }
      }
    }

    if (annotationScript.steps) {
      for (const step of annotationScript.steps) {
        if (step.filter) {
          checkFilters(step.filter);
        }
        if (foundTwoAxes) {
          break;
        }
      }
    }

    return foundTwoAxes;
  });

  return {
    getValuesForSelectedColumns: () => {
      const { bySampleAndClonotypeColumns, byClonotypeColumns } = app.model.outputs;
      const pFrame = app.model.args.annotationScript.mode === 'bySampleAndClonotype'
        ? [byClonotypeColumns?.pFrame, bySampleAndClonotypeColumns?.pFrame]
        : [byClonotypeColumns?.pFrame];

      if (pFrame.some((pf) => pf === undefined)) {
        throw new Error('Platforma PFrame is not available');
      }

      return getValuesForSelectedColumns(selectedColumns.value, pFrame as PFrameHandle[]);
    },
    selectedColumns,
    hasSelectedColumns,
    isAnnotationModalOpen,
    isRunAllowed,
    filterColumns,
    routes: {
      '/': () => PerSamplePage,
      '/overlap': () => OverlapPage,
      '/stats': () => AnnotationStatsPage,
    },
  };
}, { debug: false });

export const useApp = sdkPlugin.useApp;
