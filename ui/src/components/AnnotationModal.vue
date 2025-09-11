<script setup lang="ts">
import { PlAnnotationsModal } from '@platforma-sdk/ui-vue';
import { computed } from 'vue';
import { useApp } from '../app';
import { getDefaultAnnotationScript } from '../utils';
import AnnotationCreateDialog from './AnnotationCreateDialog.vue';

const app = useApp();

// State
const hasAnnotation = computed(() => app.model.ui.annotationScript.isCreated === true);

const openedDialog = computed({
  get: () => !hasAnnotation.value && app.isAnnotationModalOpen,
  set: (value: boolean) => (app.isAnnotationModalOpen = value),
});
const openedModal = computed({
  get: () => hasAnnotation.value && app.isAnnotationModalOpen,
  set: (value: boolean) => (app.isAnnotationModalOpen = value),
});

// Actions
function handleCreateAnnotation(props: { type: 'byClonotype' | 'bySampleAndClonotype'; name: string }) {
  app.model.ui.annotationScript.isCreated = true;
  app.model.ui.annotationScript.mode = props.type;
  app.model.ui.annotationScript.title = props.name;
  app.model.ui.annotationScript.steps = [];
}

async function handleDeleteSchema() {
  Object.assign(app.model.ui.annotationScript, getDefaultAnnotationScript());
}

</script>

<template>
  <AnnotationCreateDialog
    v-model:opened="openedDialog"
    :onSubmit="handleCreateAnnotation"
  />
  <PlAnnotationsModal
    v-model:opened="openedModal"
    v-model:annotation="app.model.ui.annotationScript"
    :columns="app.filterColumns"
    :hasSelectedColumns="app.hasSelectedColumns"
    :getValuesForSelectedColumns="app.getValuesForSelectedColumns"
    :onDeleteSchema="handleDeleteSchema"
  />
</template>
