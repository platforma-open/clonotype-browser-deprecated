<script setup lang="ts">
import {
  PlAgDataTableV2,
  PlAnnotationsModal,
  PlBlockPage,
  PlBtnGhost,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';

const app = useApp();

const tableSettings = usePlDataTableSettingsV2({
  sourceId: () => app.model.args.annotationScript.steps.length > 0 ? app.model.args.annotationScript.steps : undefined,
  model: () => app.model.outputs.statsTableV2,
});
</script>

<template>
  <PlBlockPage>
    <template #title>
      Annotation Stats - {{ app.model.args.annotationScript.title }}
    </template>
    <template #append>
      <PlBtnGhost icon="settings" @click.stop="app.isAnnotationModalOpen = true">
        Annotations
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.statsTable.tableState"
      :settings="tableSettings"
      show-export-button
    />
  </PlBlockPage>
  <PlAnnotationsModal
    v-model:annotation="app.model.ui.annotationScript"
    v-model:opened="app.isAnnotationModalOpen"
    :columns="app.filterColumns"
    :hasSelectedColumns="app.hasSelectedColumns"
    :getValuesForSelectedColumns="app.getValuesForSelectedColumns"
  />
</template>
