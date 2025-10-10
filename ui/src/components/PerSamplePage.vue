<script setup lang="ts">
import { type PlRef, plRefsEqual } from '@platforma-sdk/model';
import {
  PlAgDataTableV2,
  PlAnnotationsModal,
  PlBlockPage,
  PlBtnGhost,
  PlDropdownRef,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import ExportBtn from './ExportBtn.vue';

const app = useApp();

function setAnchorColumn(ref: PlRef | undefined) {
  app.model.args.inputAnchor = ref;
  if (ref) {
    app.model.args.datasetTitle = app.model.outputs.inputOptions?.find((o) => plRefsEqual(o.ref, ref))?.label;
  } else {
    app.model.args.datasetTitle = undefined;
  }
}

const tableSettings = usePlDataTableSettingsV2({
  sourceId: () => app.model.args.inputAnchor,
  model: () => app.model.outputs.perSampleTable,
  sheets: () => app.model.outputs.perSampleTableSheets,
});

app.model.ui.allowRunPerSample = app.isRunAllowed;

</script>

<template>
  <PlBlockPage>
    {{ app.isRunAllowed }}
    <template #title>
      Per Sample Clonotype Browser
    </template>
    <template #append>
      <ExportBtn />
      <PlBtnGhost icon="settings" @click.stop="app.isAnnotationModalOpen = true">
        Annotations
      </PlBtnGhost>
      <PlBtnGhost icon="settings" @click.exact.stop="() => (app.model.ui.settingsOpen = true)">
        Settings
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.perSampleTable.tableState"
      v-model:selection="app.selectedColumns"
      :settings="tableSettings"
    />
  </PlBlockPage>
  <PlSlideModal v-model="app.model.ui.settingsOpen" :close-on-outside-click="true">
    <template #title>Settings</template>
    <PlDropdownRef
      :options="app.model.outputs.inputOptions"
      :model-value="app.model.args.inputAnchor"
      label="Select dataset"
      clearable
      @update:model-value="setAnchorColumn"
    />
  </PlSlideModal>
  <PlAnnotationsModal
    v-model:annotation="app.model.ui.annotationScript"
    v-model:opened="app.isAnnotationModalOpen"
    :columns="app.filterColumns"
    :hasSelectedColumns="app.hasSelectedColumns"
    :getValuesForSelectedColumns="app.getValuesForSelectedColumns"
  />
</template>
