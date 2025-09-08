import type {
  AnchoredPColumnSelector,
  AnnotationScript,
  AnnotationScriptUi,
  AnnotationSpecs,
  InferHrefType,
  InferOutputsType,
  PColumn,
  PColumnDataUniversal,
  PColumnEntryUniversal,
  PlDataTableStateV2,
  PlRef,
  PObjectId,
  SimplifiedUniversalPColumnEntry,
} from '@platforma-sdk/model';
import {
  BlockModel,
  createPlDataTableStateV2,
  createPlDataTableV2,
  PColumnCollection,
} from '@platforma-sdk/model';
import omit from 'lodash.omit';

type BlockArgs = {
  /** Anchor column from the clonotyping output (must have sampleId and clonotypeKey axes) */
  inputAnchor?: PlRef;
  /** Annotation script to apply to the input anchor */
  annotationScript: AnnotationScript;
  datasetTitle?: string;

  mode: 'byClonotype' | 'bySampleAndClonotype';
  annotationSpecs: AnnotationSpecs;
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

const excludedAnnotationKeys = [
  'pl7.app/table/orderPriority',
  'pl7.app/table/visibility',
  'pl7.app/trace',
];

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

    return {
      id: entry.id,
      label: entry.label,
      obj: {
        valueType: entry.spec.valueType,
        annotations: filteredAnnotations,
      },
    };
  });

  ret.sort((a, b) => a.label.localeCompare(b.label));

  return ret;
};

const commonExcludes: AnchoredPColumnSelector[] = [
  { name: 'pl7.app/vdj/sequence/annotation' },
  { annotations: { 'pl7.app/isSubset': 'true' } },
];

export const platforma = BlockModel.create('Heavy')

  .withArgs<BlockArgs>({
    annotationScript: {
      title: 'My Annotation',
      mode: 'byClonotype',
      steps: [],
    },
    mode: 'byClonotype',
    annotationSpecs: {
      title: 'My Annotation',
      specs: [],
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

  .output('exportedTsvZip', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;
    const tsvResource = ctx.prerun?.resolve('tsvZip');
    if (!tsvResource) return undefined;
    if (!tsvResource.getIsReadyOrError())
      return undefined;
    if (tsvResource.resourceType.name === 'Null')
      return null;
    return tsvResource.getRemoteFileHandle();
  })

  .output('overlapTable', (ctx) => {
    if (ctx.args.inputAnchor === undefined)
      return undefined;

    const anchorCtx = ctx.resultPool.resolveAnchorCtx({ main: ctx.args.inputAnchor });
    if (!anchorCtx) return undefined;

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
      }],
      { anchorCtx, exclude: commonExcludes },
    );

    if (!columns) return undefined;

    return createPlDataTableV2(
      ctx,
      columns,
      ctx.uiState.overlapTable.tableState,
    );
  })

  .output('statsTable', (ctx) => {
    const allColumns = [];
    const annotationStatsPf = ctx.prerun?.resolve({ field: 'annotationStatsPf', assertFieldType: 'Input', allowPermanentAbsence: true });
    if (annotationStatsPf && annotationStatsPf.getIsReadyOrError()) {
      const columns = annotationStatsPf.getPColumns();
      if (columns) {
        allColumns.push(columns);
      }
    }
    const sampleStatsPf = ctx.prerun?.resolve({ field: 'sampleStatsPf', assertFieldType: 'Input', allowPermanentAbsence: true });
    if (sampleStatsPf && sampleStatsPf.getIsReadyOrError()) {
      const columns = sampleStatsPf.getPColumns();
      if (columns) {
        allColumns.push(columns);
      }
    }

    if (allColumns.length !== 2) return undefined;

    const collection = new PColumnCollection()
      .addAxisLabelProvider(ctx.resultPool);

    for (const cols of allColumns) {
      collection.addColumns(cols);
    }

    const columnsAfterSplitting = collection
      .getColumns([
        // annotationStatsPf without split
        { axes: [{ }] },
        // sampleStatsPf with split sampleId
        { axes: [{ split: true }, { }] },
      ]);

    if (columnsAfterSplitting === undefined) return undefined;

    return createPlDataTableV2(
      ctx,
      columnsAfterSplitting,
      ctx.uiState.statsTable.tableState,
    );
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

  .argsValid((ctx) => ctx.args.inputAnchor !== undefined && ctx.args.annotationScript.steps.length > 0)

  // We enrich the input, only if we produce annotations
  .enriches((args) => args.inputAnchor !== undefined && args.annotationScript.steps.length > 0 ? [args.inputAnchor] : [])

  .title((ctx) => ctx.args.annotationScript.steps.length > 0
    ? `Annotation - ${ctx.args.annotationScript.title}`
    : ctx.args.datasetTitle
      ? `Clonotype Browser - ${ctx.args.datasetTitle}`
      : 'Clonotype Browser')

  .done(2);

export type Platforma = typeof platforma;

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
export type { BlockArgs };
