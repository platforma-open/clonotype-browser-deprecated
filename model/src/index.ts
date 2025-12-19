import type {
  AnnotationScript,
  AnnotationScriptUi,
  InferHrefType,
  InferOutputsType,
  PColumn,
  PColumnDataUniversal,
  PColumnEntryUniversal,
  PColumnSpec,
  PlDataTableStateV2,
  PlRef,
  PObjectId,
  SUniversalPColumnId,
} from '@platforma-sdk/model';
import {
  Annotation,
  BlockModel,
  canonicalizeJson,
  createPlDataTableSheet,
  createPlDataTableStateV2,
  createPlDataTableV2,
  getUniquePartitionKeys,
  PColumnCollection,
} from '@platforma-sdk/model';
import omit from 'lodash.omit';
import { isAnnotationScriptValid } from './validation';
import {
  commonExcludes,
  excludedAnnotationKeys,
  getLinkedColumnsForArgs,
  type LinkedColumnEntry,
} from './column_utils';

export type { LinkedColumnEntry } from './column_utils';

export type TableInputs = {
  byClonotypeLabels: Record<string, string>; // Map from deterministic column key (name|domain) to derived label
  linkedColumns: Record<string, LinkedColumnEntry>;
};

type BlockArgs = {
  /** Anchor column from the clonotyping output (must have sampleId and clonotypeKey axes) */
  inputAnchor?: PlRef;
  /** Annotation script to apply to the input anchor */
  annotationScript: AnnotationScript;
  datasetTitle?: string;
  /** Enables export all */
  runExportAll: boolean;
  /** Table export inputs: labels and linked columns */
  tableInputs?: TableInputs;
};

export type UiState = {
  settingsOpen: boolean;
  perSampleTable: {
    tableState: PlDataTableStateV2;
  };
  overlapTable: {
    tableState: PlDataTableStateV2;
  };
  statsTable: {
    tableState: PlDataTableStateV2;
  };
  annotationScript: AnnotationScriptUi;
};

export type SimplifiedUniversalPColumnEntry = {
  id: SUniversalPColumnId;
  label: string;
  spec: PColumnSpec;
  derivedLabel?: string; // Label derived from trace information
};

const simplifyColumnEntries = (
  entries: PColumnEntryUniversal[] | undefined,
): SimplifiedUniversalPColumnEntry[] | undefined => {
  if (!entries) {
    return undefined;
  }

  const ret = entries.map((entry) => {
    const filteredAnnotations = entry.spec.annotations
      ? omit(entry.spec.annotations, excludedAnnotationKeys)
      : undefined;

    // Use the label derived by PColumnCollection (from trace information)
    const derivedLabel = entry.label;

    return {
      id: entry.id,
      label: entry.label,
      spec: {
        ...entry.spec,
        annotations: filteredAnnotations,
      },
      derivedLabel,
    };
  });

  ret.sort((a, b) => a.label.localeCompare(b.label));

  return ret;
};

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({
    annotationScript: {
      title: 'My Annotation',
      mode: 'byClonotype',
      steps: [],
    },
    runExportAll: false,
    tableInputs: {
      byClonotypeLabels: {},
      linkedColumns: {},
    },
  })

  .withUiState<UiState>({
    settingsOpen: true,
    perSampleTable: {
      tableState: createPlDataTableStateV2(),
    },
    overlapTable: {
      tableState: createPlDataTableStateV2(),
    },
    statsTable: {
      tableState: createPlDataTableStateV2(),
    },
    annotationScript: {
      title: 'My Annotation',
      mode: 'byClonotype',
      steps: [],
    },
  })

  .output('inputOptions', (ctx) =>
    ctx.resultPool.getOptions([{
      axes: [
        { name: 'pl7.app/sampleId' },
        { name: 'pl7.app/vdj/clonotypeKey' },
      ],
      annotations: { 'pl7.app/isAnchor': 'true' },
    }, {
      axes: [
        { name: 'pl7.app/sampleId' },
        { name: 'pl7.app/vdj/scClonotypeKey' },
      ],
      annotations: { 'pl7.app/isAnchor': 'true' },
    }], {
      refsWithEnrichments: true,
    }),
  )

  .output('byClonotypeColumns', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;
    const anchorCtx = ctx.resultPool.resolveAnchorCtx({ main: ctx.args.inputAnchor });
    if (!anchorCtx) return undefined;

    const entries = new PColumnCollection()
      .addColumnProvider(ctx.resultPool)
      .addAxisLabelProvider(ctx.resultPool)
      .getUniversalEntries(
        [{
          domainAnchor: 'main',
          axes: [
            { anchor: 'main', idx: 1 },
          ],
        }, {
          domainAnchor: 'main',
          axes: [
            { split: true },
            { anchor: 'main', idx: 1 },
          ],
          annotations: {
            'pl7.app/isAbundance': 'true',
          },
        }],
        { anchorCtx },
      );
    return {
      columns: simplifyColumnEntries(entries),
      pFrame: ctx.createPFrame(entries
        ?.map((e) => {
          return {
            id: e.id as PObjectId,
            spec: e.spec,
            data: e.data(),
          };
        }).filter((e): e is PColumn<PColumnDataUniversal> => e.data !== undefined) ?? []),
    };
  })

  .output('bySampleAndClonotypeColumns', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;
    const anchorCtx = ctx.resultPool.resolveAnchorCtx({ main: ctx.args.inputAnchor });
    if (!anchorCtx) return undefined;

    const entries = new PColumnCollection()
      .addColumnProvider(ctx.resultPool)
      .addAxisLabelProvider(ctx.resultPool)
      .getUniversalEntries(
        {
          domainAnchor: 'main',
          axes: [
            { anchor: 'main', idx: 0 },
            { anchor: 'main', idx: 1 },
          ],
        },
        { anchorCtx },
      );
    return {
      columns: simplifyColumnEntries(entries),
      pFrame: ctx.createPFrame(entries
        ?.map((e) => {
          return {
            id: e.id as PObjectId,
            spec: e.spec,
            data: e.data(),
          };
        }).filter((e): e is PColumn<PColumnDataUniversal> => e.data !== undefined) ?? []),
    };
  })

  .output('mainAbundanceColumn', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;

    const ops = ctx.resultPool.getCanonicalOptions(
      { main: ctx.args.inputAnchor },
      {
        axes: [
          { anchor: 'main', idx: 0 },
          { anchor: 'main', idx: 1 },
        ],
        annotations: {
          'pl7.app/isAbundance': 'true',
          'pl7.app/abundance/normalized': 'true',
          'pl7.app/abundance/isPrimary': 'true',
        },
      },
    );
    if (ops === undefined || ops.length === 0) return undefined;
    return ops[0];
  })

  .output('clonotypeColumnOptions', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;

    return ctx.resultPool.getCanonicalOptions(
      { main: ctx.args.inputAnchor },
      {
        domainAnchor: 'main',
        axes: [
          { anchor: 'main', idx: 1 },
        ],
        annotations: {
          'pl7.app/table/visibility': 'default',
        },
      },
    );
  })

  // .output('exportDebug', (ctx) => {
  //   return ctx.prerun?.resolve('exportDebug')?.getDataAsJson();
  // })

  .output('exportedTsvZip', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;
    const tsvResource = ctx.prerun?.resolve({ field: 'tsvZip', assertFieldType: 'Input', allowPermanentAbsence: true });
    if (!tsvResource) return undefined;
    if (!tsvResource.getIsReadyOrError())
      return undefined;
    if (tsvResource.resourceType.name === 'Null')
      return null;
    return tsvResource.getRemoteFileHandle();
  })

  .output('tableInputs', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;

    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(ctx.args.inputAnchor);
    if (!anchorSpec) return undefined;

    // Get linked columns
    const linkedColumns = getLinkedColumnsForArgs(ctx, ctx.args.inputAnchor, anchorSpec);

    // Build byClonotypeLabels map using getUniversalEntries with overrideLabelAnnotation
    const byClonotypeLabels: Record<string, string> = {};
    const anchorCtx = ctx.resultPool.resolveAnchorCtx({ main: ctx.args.inputAnchor });
    if (anchorCtx) {
      const collection = new PColumnCollection();
      collection
        .addColumnProvider(ctx.resultPool)
        .addAxisLabelProvider(ctx.resultPool);

      // Use getUniversalEntries() with overrideLabelAnnotation: true
      // This applies the same label derivation as UI tables without loading data
      const entries = collection.getUniversalEntries(
        [{
          domainAnchor: 'main',
          axes: [
            { anchor: 'main', idx: 1 },
          ],
        }, {
          domainAnchor: 'main',
          axes: [
            { split: true },
            { anchor: 'main', idx: 1 },
          ],
          annotations: {
            'pl7.app/isAbundance': 'true',
          },
        }],
        {
          anchorCtx,
          exclude: commonExcludes,
          overrideLabelAnnotation: true, // Same label behavior as getColumns()
        },
      );

      if (entries) {
        for (const entry of entries) {
          // Create a deterministic key using canonical JSON serialization
          // This matches the approach used for linkedColumns
          const keyObj: { name: string; domain?: Record<string, string> } = {
            name: entry.spec.name,
          };
          if (entry.spec.domain && Object.keys(entry.spec.domain).length > 0) {
            // Filter domain to only include string values (matching linkedColumns approach)
            const domain: Record<string, string> = {};
            for (const [key, value] of Object.entries(entry.spec.domain)) {
              if (typeof value === 'string') {
                domain[key] = value;
              }
            }
            if (Object.keys(domain).length > 0) {
              keyObj.domain = domain;
            }
          }
          const key = canonicalizeJson(keyObj);

          // Use the label from spec annotations (set by overrideLabelAnnotation: true)
          const label = entry.spec.annotations?.[Annotation.Label] || '';
          if (label) {
            byClonotypeLabels[key] = label;
          }
        }
      }
    }

    return {
      byClonotypeLabels,
      linkedColumns: linkedColumns || {},
    };
  })

  .output('overlapTable', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;

    const anchorCtx = ctx.resultPool.resolveAnchorCtx({ main: ctx.args.inputAnchor });
    if (!anchorCtx) return undefined;

    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(ctx.args.inputAnchor);
    if (!anchorSpec) return undefined;

    const collection = new PColumnCollection();

    const aggregates = ctx.prerun?.resolve({ field: 'aggregatesPf', assertFieldType: 'Input', allowPermanentAbsence: true })?.getPColumns();
    if (aggregates) collection.addColumns(aggregates);

    const annotation = ctx.prerun?.resolve({ field: 'annotationPf', assertFieldType: 'Input', allowPermanentAbsence: true })?.getPColumns();
    if (annotation) collection.addColumns(annotation);

    // result pool is added after the pre-run ouptus so that pre-run results take precedence
    collection
      .addColumnProvider(ctx.resultPool)
      .addAxisLabelProvider(ctx.resultPool);

    const columns = collection.getColumns(
      [{
        domainAnchor: 'main',
        axes: [
          { split: true },
          { anchor: 'main', idx: 1 },
        ],
        annotations: {
          'pl7.app/isAbundance': 'true',
        },
      }, {
        domainAnchor: 'main',
        axes: [
          { anchor: 'main', idx: 1 },
        ],
      }, {
        // Include linker columns that connect to our anchor axis
        axes: [
          { anchor: 'main', idx: 1 },
          {},
        ],
        annotations: {
          'pl7.app/isLinkerColumn': 'true',
        },
      }, {
        // Include linker columns in reverse order
        axes: [
          {},
          { anchor: 'main', idx: 1 },
        ],
        annotations: {
          'pl7.app/isLinkerColumn': 'true',
        },
      }],
      { anchorCtx, exclude: commonExcludes, enrichByLinkers: true },
    );

    if (!columns) return undefined;

    columns.forEach((column) => {
      if (column.spec.annotations?.['pl7.app/isAbundance'] === 'true' && column.spec.name !== 'pl7.app/vdj/sampleCount')
        column.spec.annotations['pl7.app/table/visibility'] = 'optional';
    });

    return createPlDataTableV2(
      ctx,
      columns,
      ctx.uiState.overlapTable.tableState,
    );
  })

  .output('perSampleTableSheets', (ctx) => {
    if (ctx.args.inputAnchor === undefined) return undefined;

    const anchor = ctx.resultPool.getPColumnByRef(ctx.args.inputAnchor);
    if (!anchor) return undefined;

    const samples = getUniquePartitionKeys(anchor.data)?.[0];
    if (!samples) return undefined;

    return [createPlDataTableSheet(ctx, anchor.spec.axesSpec[0], samples)];
  })

  .output('perSampleTable', (ctx) => {
    if (ctx.args.inputAnchor === undefined) return undefined;

    const anchor = ctx.resultPool.getPColumnByRef(ctx.args.inputAnchor);
    if (!anchor) return undefined;

    const anchorCtx = ctx.resultPool.resolveAnchorCtx({ main: ctx.args.inputAnchor });
    if (!anchorCtx) return undefined;

    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(ctx.args.inputAnchor);
    if (!anchorSpec) return undefined;

    const collection = new PColumnCollection();

    const annotation = ctx.prerun?.resolve({ field: 'annotationPf', assertFieldType: 'Input', allowPermanentAbsence: true })?.getPColumns();
    if (annotation) collection.addColumns(annotation);

    // result pool is added after the pre-run ouptus so that pre-run results take precedence
    collection
      .addColumnProvider(ctx.resultPool)
      .addAxisLabelProvider(ctx.resultPool);

    const columns = collection.getColumns(
      [{
        domainAnchor: 'main',
        axes: [
          { anchor: 'main', idx: 0 },
          { anchor: 'main', idx: 1 },
        ],
      }, {
        domainAnchor: 'main',
        axes: [
          { anchor: 'main', idx: 1 },
        ],
      }, {
        // Include linker columns that connect to our anchor axis
        axes: [
          { anchor: 'main', idx: 1 },
          {},
        ],
        annotations: {
          'pl7.app/isLinkerColumn': 'true',
        },
      }, {
        // Include linker columns in reverse order
        axes: [
          {},
          { anchor: 'main', idx: 1 },
        ],
        annotations: {
          'pl7.app/isLinkerColumn': 'true',
        },
      }],
      {
        anchorCtx,
        exclude: commonExcludes,
        overrideLabelAnnotation: false,
        enrichByLinkers: true,
      },
    );

    if (!columns) return undefined;

    return createPlDataTableV2(
      ctx,
      columns,
      ctx.uiState.perSampleTable.tableState,
    );
  })

  .output('statsTable', (ctx) => {
    const statsPf = ctx.prerun?.resolve({ field: 'statsPf', assertFieldType: 'Input', allowPermanentAbsence: true });
    if (statsPf && statsPf.getIsReadyOrError()) {
      const columns = statsPf.getPColumns();
      if (!columns) return undefined;

      const columnsAfterSplitting = new PColumnCollection()
        .addAxisLabelProvider(ctx.resultPool)
        .addColumns(columns)
        .getColumns({ axes: [{ split: true }, { }] });

      if (columnsAfterSplitting === undefined) return undefined;

      return createPlDataTableV2(
        ctx,
        columnsAfterSplitting,
        ctx.uiState.statsTable.tableState,
      );
    }
    return undefined;
  })

  .sections((ctx) => {
    return [
      { type: 'link', href: '/', label: 'Per Sample ' } as const,
      { type: 'link', href: '/overlap', label: 'Overlap' } as const,
      ...(ctx.args.annotationScript.steps.length > 0
        ? [{ type: 'link', href: '/stats', label: 'Annotation Stats' } as const]
        : []),
    ];
  })

  .argsValid((ctx) => {
    if (ctx.args.inputAnchor === undefined || ctx.args.annotationScript.steps.length === 0) {
      return false;
    }
    return isAnnotationScriptValid(ctx.args.annotationScript);
  })

  // We enrich the input, only if we produce annotations
  .enriches((args) => args.inputAnchor !== undefined && args.annotationScript.steps.length > 0 ? [args.inputAnchor] : [])

  .title((ctx) => ctx.args.annotationScript.steps.length > 0
    ? `Annotation - ${ctx.args.annotationScript.title}`
    : ctx.args.datasetTitle
      ? `Clonotype Browser - ${ctx.args.datasetTitle}`
      : 'Clonotype Browser')

  .done(2);

export { isAnnotationScriptValid } from './validation';
export type { BlockArgs };
export type Platforma = typeof platforma;

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
