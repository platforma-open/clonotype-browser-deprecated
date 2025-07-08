import type { Platforma, SimplifiedUniversalPColumnEntry } from '@platforma-open/milaboratories.clonotype-browser-2.model';
import type { PFrameHandle } from '@platforma-sdk/model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import AnnotationStatsPage from './AnnotationStatsPage.vue';
import { migrateUiState } from './migration';
import { processAnnotatiuoUiStateToArgs } from './model';
import OverlapPage from './OverlapPage.vue';
import PerSamplePage from './PerSamplePage.vue';
import { getValuesForSelectedColumns } from './utils';

export const sdkPlugin = defineApp(platforma as Platforma, (app) => {
  migrateUiState(app.model.ui);
  processAnnotatiuoUiStateToArgs(
    () => app.model.ui.annotationScript,
    () => app.model.args.annotationScript,
  );

  const isAnnotationModalOpen = ref(false);
  const hasSelectedColumns = computed(() => {
    return app.model.ui.selectedColumns?.selectedKeys.length > 0;
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

      return getValuesForSelectedColumns(app.model.ui.selectedColumns, pFrame as PFrameHandle[]);
    },
    hasSelectedColumns,
    isAnnotationModalOpen,
    filterColumns,
    routes: {
      '/': () => PerSamplePage,
      '/overlap': () => OverlapPage,
      '/stats': () => AnnotationStatsPage,
    },
  };
}, { debug: true });

export const useApp = sdkPlugin.useApp;
