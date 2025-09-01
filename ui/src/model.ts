import type { AnnotationScript, AnnotationScriptUi, AnnotationSpecs } from '@platforma-sdk/model';
import { compileAnnotationScript, convertAnnotationSpecs } from '@platforma-sdk/model';
import { watchDebounced } from '@vueuse/core';

export function processAnnotatiuoUiStateToArgs(
  getUiState: () => AnnotationScriptUi,
  getArgsState: () => AnnotationScript,
) {
  watchDebounced(getUiState, (value) => {
    try {
      Object.assign(getArgsState(), compileAnnotationScript(value));
    } catch (err) {
      console.error('Error while compiling annotation UI state to Args:', err);
    }
  }, { deep: true, debounce: 1000 });
}

export function processAnnotationUiStateToArgsState(
  getUiState: () => AnnotationScriptUi,
  getArgsState: () => AnnotationSpecs,
) {
  watchDebounced(getUiState, () => {
    try {
      const uiState = getUiState();
      const argsState = getArgsState();

      argsState.title = uiState.title;
      argsState.specs = convertAnnotationSpecs(uiState.steps);
    } catch (err) {
      console.error('Error while compiling annotation UI state to Args:', err);
    }
  }, { deep: true, debounce: 1000 });
}
