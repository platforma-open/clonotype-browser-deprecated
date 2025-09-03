import type { Platforma } from '@platforma-open/milaboratories.clonotype-browser-2.model';
import { platforma } from '@platforma-open/milaboratories.clonotype-browser-2.model';
import type { PFrameHandle, PlSelectionModel, SimplifiedUniversalPColumnEntry } from '@platforma-sdk/model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { computed, ref, watch } from 'vue';
import AnnotationStatsPage from './components/AnnotationStatsPage.vue';
import OverlapPage from './components/OverlapPage.vue';
import { migrateUiState } from './migration';
import { processAnnotationUiStateToArgsState, processAnnotatiuoUiStateToArgs } from './model';
import { getValuesForSelectedColumns } from './utils';

export const sdkPlugin = defineApp(platforma as Platforma, (app) => {
  watch(() => app.model.outputs.overlapTableV2, (v) => {
    console.log('>>>', v);
  }, { immediate: true });

  migrateUiState(app.model.ui);
  processAnnotatiuoUiStateToArgs(
    () => app.model.ui.annotationScript,
    () => app.model.args.annotationScript,
  );
  processAnnotationUiStateToArgsState(
    () => app.model.ui.annotationScript,
    () => app.model.args.annotationSpecs,
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
    filterColumns,
    routes: {
      '/': () => OverlapPage,
      '/overlap': () => OverlapPage,
      '/stats': () => AnnotationStatsPage,
    },
  };
}, { debug: false });

export const useApp = sdkPlugin.useApp;
