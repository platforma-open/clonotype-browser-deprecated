import type {
  AnchoredPColumnSelector,
  PColumn,
  PColumnDataUniversal,
  PColumnSpec,
  PlRef,
  RenderCtx,
} from '@platforma-sdk/model';
import { Annotation, canonicalizeJson, deriveLabels, isLabelColumn } from '@platforma-sdk/model';

/**
 * Annotation keys to exclude when simplifying column entries.
 */
export const excludedAnnotationKeys = [
  'pl7.app/table/orderPriority',
  'pl7.app/table/visibility',
  'pl7.app/trace',
];

/**
 * Common column selectors to exclude from queries.
 */
export const commonExcludes: AnchoredPColumnSelector[] = [
  { name: 'pl7.app/vdj/sequence/annotation' },
  { annotations: { 'pl7.app/isSubset': 'true' } },
];

/**
 * Adds suffixes to duplicate labels in a label map.
 * For each label that appears multiple times:
 * - The first occurrence keeps the original label
 * - Subsequent occurrences get suffixes: " (1)", " (2)", etc.
 *
 * @param labelMap - Map of identifier -> label
 * @returns Map of identifier -> unique label (with suffixes if needed)
 */
export function addSuffixesToDuplicateLabels<K extends string>(
  labelMap: Record<K, string>,
): Record<K, string> {
  const labelCounts = new Map<string, number>();
  const labelOccurrences = new Map<string, number>();
  const finalLabels: Record<string, string> = {};

  // Get entries with proper typing
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const entries = Object.entries(labelMap) as Array<[string, string]>;

  // Count occurrences of each label
  for (const [_id, label] of entries) {
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  }

  // Add suffixes for duplicates
  for (const [id, label] of entries) {
    const count = labelCounts.get(label) || 0;
    if (count > 1) {
      const occurrence = (labelOccurrences.get(label) || 0) + 1;
      labelOccurrences.set(label, occurrence);

      if (occurrence > 1) {
        finalLabels[id] = `${label} (${occurrence - 1})`;
      } else {
        finalLabels[id] = label;
      }
    } else {
      finalLabels[id] = label;
    }
  }

  return finalLabels as Record<K, string>;
}

/**
 * Ensures label uniqueness against a set of already used labels.
 * If the label is already used, adds numeric suffixes until a unique label is found.
 * Updates the usedLabelsSet with the final unique label.
 *
 * @param label - The label to make unique
 * @param usedLabelsSet - Set of already used labels (will be modified)
 * @returns The unique label (with suffix if needed)
 */
export function ensureUniqueLabel(
  label: string,
  usedLabelsSet: Set<string>,
): string {
  let uniqueLabel = label;
  let suffixCount = 0;

  while (usedLabelsSet.has(uniqueLabel)) {
    suffixCount += 1;
    uniqueLabel = `${label} (${suffixCount})`;
  }

  usedLabelsSet.add(uniqueLabel);
  return uniqueLabel;
}

/**
 * Derives labels for columns using trace information.
 * Does NOT handle duplicate labels - that's left to the workflow layer.
 *
 * @param columns - Array of PColumn objects
 * @returns Map from column id to derived label
 */
export function deriveLabelsFromTrace(
  columns: PColumn<PColumnDataUniversal>[],
): Map<string, string> {
  if (columns.length === 0) {
    return new Map();
  }

  // Use existing deriveLabels utility with trace information
  const derivedLabels = deriveLabels(
    columns,
    (col) => col.spec,
    { includeNativeLabel: true },
  );

  // Create a simple map - no suffix handling
  const labelMap = new Map<string, string>();
  for (const { value, label } of derivedLabels) {
    // value is the column itself, value.id is the column id
    labelMap.set(value.id as string, label);
  }

  return labelMap;
}

/**
 * Updates linked column labels to use labels derived from trace information.
 * This ensures that columns from linkers show distinguishing labels when multiple
 * linkers are present (e.g., "Cluster Size / Clustering (sim:..., ident:..., cov:...)").
 *
 * @param columns - Array of PColumn objects to update
 * @returns Array of PColumn objects with updated labels
 */
export function updateLinkedColumnLabels(
  columns: PColumn<PColumnDataUniversal>[],
): PColumn<PColumnDataUniversal>[] {
  if (columns.length === 0) {
    return columns;
  }

  // Derive labels using trace information
  const derivedLabels = deriveLabels(
    columns,
    (col) => col.spec,
    { includeNativeLabel: true },
  );

  // Create a map of column id to derived label
  const labelMap = new Map<string, string>();
  for (const { value, label } of derivedLabels) {
    labelMap.set(value.id, label);
  }

  // Update columns with derived labels
  return columns.map((col) => {
    const derivedLabel = labelMap.get(col.id);
    if (derivedLabel !== undefined) {
      // Create a deep copy of annotations to avoid mutating shared objects
      const newAnnotations = col.spec.annotations
        ? { ...col.spec.annotations, [Annotation.Label]: derivedLabel }
        : { [Annotation.Label]: derivedLabel };
      return {
        ...col,
        spec: {
          ...col.spec,
          annotations: newAnnotations,
        },
      };
    }
    return col;
  });
}

/**
 * Information about a linker column for processing.
 */
export interface LinkerInfo<_TArgs, _TUiState> {
  /** Index of the axis where clonotypeKey appears in the linker (0 or 1) */
  idx: number;
  /** The linker option containing ref and optional label */
  linkerOption: { ref: PlRef; label?: string };
  /** Name to use as anchor for this linker */
  anchorName: string;
}

/**
 * Helper function to find linker options for both axis positions.
 * Returns an array of objects containing linker information for processing.
 *
 * @param ctx - The render context
 * @param anchor - The anchor PlRef
 * @param anchorSpec - The specification of the anchor column
 * @returns Array of linker information objects
 */
export function findLinkerOptions<TArgs, TUiState>(
  ctx: RenderCtx<TArgs, TUiState>,
  anchor: PlRef,
  anchorSpec: PColumnSpec,
): LinkerInfo<TArgs, TUiState>[] {
  const linkerInfos: LinkerInfo<TArgs, TUiState>[] = [];

  // Try both axis positions (clonotypeKey might be at idx 0 or idx 1 in the linker)
  let linkerIndex = 0;
  for (const idx of [0, 1]) {
    // Calculate axes to match based on which position the anchor axis is in
    const axesToMatch = idx === 0
      ? [{}, anchorSpec.axesSpec[1]] // clonotypeKey in second axis of the linker
      : [anchorSpec.axesSpec[1], {}]; // clonotypeKey in first axis of the linker

    // Get linker refs to use as anchors for finding linked columns
    const linkerOptions = ctx.resultPool.getOptions([{
      axes: axesToMatch,
      annotations: { 'pl7.app/isLinkerColumn': 'true' },
    }]);

    // For each linker, create an info object
    for (const linkerOption of linkerOptions) {
      linkerInfos.push({
        idx,
        linkerOption,
        anchorName: `linker-${linkerIndex}`,
      });
      linkerIndex++;
    }
  }

  return linkerInfos;
}

/**
 * Result of getting linked columns.
 */
export interface LinkedColumnsResult {
  /** Linker columns that connect two different key axes */
  linkerColumns: PColumn<PColumnDataUniversal>[];
  /** Columns on the "other side" of the linker connection */
  linkedColumns: PColumn<PColumnDataUniversal>[];
}

/**
 * Gets columns linked through linker columns.
 * Linker columns connect two different key axes (e.g., clonotypeKey to clusterKey).
 * This function finds linker columns and resolves the columns on the "other side" of the link.
 *
 * @param ctx - The render context
 * @param anchor - The anchor PlRef (e.g., input anchor with clonotypeKey axis)
 * @param anchorSpec - The specification of the anchor column
 * @returns Object containing linker columns and linked columns, or undefined if not available
 */
export function getLinkedColumns<TArgs, TUiState>(
  ctx: RenderCtx<TArgs, TUiState>,
  anchor: PlRef,
  anchorSpec: PColumnSpec,
): LinkedColumnsResult | undefined {
  const linkerColumns: PColumn<PColumnDataUniversal>[] = [];
  const linkedColumns: PColumn<PColumnDataUniversal>[] = [];

  // Get linker columns for both axis positions
  for (const idx of [0, 1]) {
    const axesToMatch = idx === 0
      ? [{}, anchorSpec.axesSpec[1]]
      : [anchorSpec.axesSpec[1], {}];

    // Get linker columns that connect to our anchor's clonotypeKey axis
    const linkers = ctx.resultPool.getAnchoredPColumns(
      { main: anchor },
      [{
        axes: axesToMatch,
        annotations: { 'pl7.app/isLinkerColumn': 'true' },
      }],
    );

    if (linkers) {
      linkerColumns.push(...linkers);
    }
  }

  // Process linker options to find linked columns
  const linkerInfos = findLinkerOptions(ctx, anchor, anchorSpec);
  for (const { idx, linkerOption, anchorName } of linkerInfos) {
    const linkerAnchorSpec: Record<string, PlRef> = {
      [anchorName]: linkerOption.ref,
    };

    // Get columns that have the linker's "other" axis (the one that's not clonotypeKey)
    const linkedProps = ctx.resultPool.getAnchoredPColumns(
      linkerAnchorSpec,
      [{
        axes: [{ anchor: anchorName, idx }],
      }],
    );

    if (linkedProps) {
      linkedColumns.push(
        ...linkedProps.filter((p) => !isLabelColumn(p.spec)),
      );
    }
  }

  // Deduplicate column names using trace-based labels only if there are two or more linker columns
  const deduplicatedLinkedColumns = linkerColumns.length >= 2
    ? updateLinkedColumnLabels(linkedColumns)
    : linkedColumns;

  return { linkerColumns, linkedColumns: deduplicatedLinkedColumns };
}

/**
 * Entry for a linked column group (associated with one linker).
 */
export interface LinkedColumnEntry {
  anchorName: string;
  anchorRef: PlRef;
  columns: Record<string, string>; // Map from column ID (as string) to derived label
}

/**
 * Gets linked columns data structure for workflow arguments.
 * Similar to getLinkedColumns but returns the format needed for linkedColumns argument.
 *
 * @param ctx - The render context
 * @param anchor - The anchor PlRef (e.g., input anchor with clonotypeKey axis)
 * @param anchorSpec - The specification of the anchor column
 * @returns Record of linked column entries keyed by anchor name, or undefined if not available
 */
export function getLinkedColumnsForArgs<TArgs, TUiState>(
  ctx: RenderCtx<TArgs, TUiState>,
  anchor: PlRef,
  anchorSpec: PColumnSpec,
): Record<string, LinkedColumnEntry> | undefined {
  const result: Record<string, LinkedColumnEntry> = {};

  // Collect all linked columns across all linkers
  const allLinkedColumns: PColumn<PColumnDataUniversal>[] = [];

  const linkerInfos = findLinkerOptions(ctx, anchor, anchorSpec);

  // First pass: collect all columns
  for (const { idx, linkerOption, anchorName } of linkerInfos) {
    const linkerAnchorSpec: Record<string, PlRef> = {
      [anchorName]: linkerOption.ref,
    };

    const linkedProps = ctx.resultPool.getAnchoredPColumns(
      linkerAnchorSpec,
      [{
        axes: [{ anchor: anchorName, idx }],
      }],
    );

    if (linkedProps) {
      const filteredProps = linkedProps.filter((p) => !isLabelColumn(p.spec));
      allLinkedColumns.push(...filteredProps);
    }
  }

  // Derive labels for all linked columns (no suffix handling)
  const derivedLabelMap = deriveLabelsFromTrace(allLinkedColumns);

  // Second pass: build result with labels
  for (const { idx, linkerOption, anchorName } of linkerInfos) {
    const linkerAnchorSpec: Record<string, PlRef> = {
      [anchorName]: linkerOption.ref,
    };

    // Get columns that have the linker's "other" axis (the one that's not clonotypeKey)
    const linkedProps = ctx.resultPool.getAnchoredPColumns(
      linkerAnchorSpec,
      [{
        axes: [{ anchor: anchorName, idx }],
      }],
    );

    if (linkedProps && linkedProps.length > 0) {
      const filteredProps = linkedProps.filter((p) => !isLabelColumn(p.spec));

      const columns: Record<string, string> = {};

      for (const p of filteredProps) {
        // Create AnchoredPColumnSelector query for this column
        // We need to match by the column's spec properties
        const query: AnchoredPColumnSelector = {
          axes: [{ anchor: anchorName, idx }],
        };

        // Add domain if present
        if (p.spec.domain && Object.keys(p.spec.domain).length > 0) {
          // Convert domain to string values only (no anchor refs) for serialization
          const domain: Record<string, string> = {};
          for (const [key, value] of Object.entries(p.spec.domain)) {
            if (typeof value === 'string') {
              domain[key] = value;
            }
          }
          if (Object.keys(domain).length > 0) {
            query.domain = domain;
          }
        }

        // Add name if it's not a generic column
        if (p.spec.name) {
          query.name = p.spec.name;
        }

        // Serialize to canonical JSON string for deterministic key generation
        const queryStr = canonicalizeJson(query);

        // Use derived label from trace, fallback to annotation label
        const derivedLabel = derivedLabelMap.get(p.id as string)
          || p.spec.annotations?.[Annotation.Label]
          || '';

        // Map query string to label
        columns[queryStr] = derivedLabel;
      }

      if (Object.keys(columns).length > 0) {
        result[anchorName] = {
          anchorName,
          anchorRef: linkerOption.ref,
          columns, // Map from query to derived label
        };
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Adds linked columns to an existing columns array.
 * This helper handles fetching linked columns through linkers, deduplicating them,
 * and marking linker columns as hidden in the UI.
 *
 * @param ctx - The render context
 * @param anchor - The anchor PlRef (e.g., input anchor with clonotypeKey axis)
 * @param anchorSpec - The specification of the anchor column
 * @param columns - The existing columns array to append linked columns to
 */
export function addLinkedColumnsToArray<TArgs, TUiState>(
  ctx: RenderCtx<TArgs, TUiState>,
  anchor: PlRef,
  anchorSpec: PColumnSpec,
  columns: PColumn<PColumnDataUniversal>[],
): void {
  // Get linked columns through linkers (e.g., cluster columns)
  // Get them BEFORE we modify any columns to avoid affecting the collection
  const linked = getLinkedColumns(ctx, anchor, anchorSpec);

  // Filter out linked columns that are already in the main columns array to avoid duplicates
  const existingColumnIds = new Set(columns.map((c) => c.id));
  const newLinkedColumns = linked?.linkedColumns.filter((c) => !existingColumnIds.has(c.id)) ?? [];
  const newLinkerColumns = linked?.linkerColumns.filter((c) => !existingColumnIds.has(c.id)) ?? [];

  // Add linker columns but mark them as hidden - they're needed for PFrame structure but shouldn't be shown in UI
  if (newLinkerColumns.length > 0) {
    const hiddenLinkerColumns = newLinkerColumns.map((linkerColumn) => ({
      ...linkerColumn,
      spec: {
        ...linkerColumn.spec,
        annotations: {
          ...linkerColumn.spec.annotations,
          'pl7.app/table/visibility': 'hidden',
        },
      },
    }));
    columns.push(...hiddenLinkerColumns);
  }

  if (newLinkedColumns.length > 0) {
    columns.push(...newLinkedColumns);
  }
}
