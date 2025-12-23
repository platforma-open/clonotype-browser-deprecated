import type {
  BlockArgs,
  BlockOutputs,
  platforma,
  SimplifiedUniversalPColumnEntry,
} from '@platforma-open/milaboratories.clonotype-browser-2.model';
import { blockSpec as clonotypingBlockSpec } from '@platforma-open/milaboratories.mixcr-clonotyping-2';
import type {
  BlockArgs as MiXCRClonotypingBlockArgs,
  BlockOutputs as MiXCRClonotypingBlockOutputs,
  platforma as mixcrPlatforma,
} from '@platforma-open/milaboratories.mixcr-clonotyping-2.model';
import {
  SupportedPresetList,
  uniquePlId,
} from '@platforma-open/milaboratories.mixcr-clonotyping-2.model';
import { blockSpec as samplesAndDataBlockSpec } from '@platforma-open/milaboratories.samples-and-data';
import type { BlockArgs as SamplesAndDataBlockArgs } from '@platforma-open/milaboratories.samples-and-data.model';
import type { AnnotationScript, InferBlockState, SUniversalPColumnId } from '@platforma-sdk/model';
import { wrapOutputs } from '@platforma-sdk/model';
import type { ML, RawHelpers } from '@platforma-sdk/test';
import { awaitStableState, blockTest } from '@platforma-sdk/test';
import { blockSpec as annotationBlockSpec } from 'this-block';
import type { expect as vitestExpect } from 'vitest';

// Helper function for common setup
async function setupProject(
  { rawPrj: project, ml, helpers, expect }:
  { rawPrj: ML.Project; ml: ML.MiddleLayer; helpers: RawHelpers; expect: typeof vitestExpect },
) {
  const sndBlockId = await project.addBlock('Samples & Data', samplesAndDataBlockSpec);
  const clonotypingBlockId = await project.addBlock('MiXCR Clonotyping', clonotypingBlockSpec);
  const annotationBlockId = await project.addBlock('Clonotype Annotation', annotationBlockSpec);

  const metaColumnDonorId = uniquePlId();
  const metaColumnTissueId = uniquePlId();
  const metaColumnDayAfterVaccinationId = uniquePlId();
  const dataset1Id = uniquePlId();

  const s652_sampleId = uniquePlId();
  const s652_r1Handle = await helpers.getLocalFileHandle('./assets/SRR11233652_sampledBulk_R1.fastq.gz');
  const s652_r2Handle = await helpers.getLocalFileHandle('./assets/SRR11233652_sampledBulk_R2.fastq.gz');
  const s663_sampleId = uniquePlId();
  const s663_r1Handle = await helpers.getLocalFileHandle('./assets/SRR11233663_sampledBulk_R1.fastq.gz');
  const s663_r2Handle = await helpers.getLocalFileHandle('./assets/SRR11233663_sampledBulk_R2.fastq.gz');
  const s664_sampleId = uniquePlId();
  const s664_r1Handle = await helpers.getLocalFileHandle('./assets/SRR11233664_sampledBulk_R1.fastq.gz');
  const s664_r2Handle = await helpers.getLocalFileHandle('./assets/SRR11233664_sampledBulk_R2.fastq.gz');

  await project.setBlockArgs(sndBlockId, {
    metadata: [
      {
        id: metaColumnDonorId,
        label: 'Donor',
        global: false,
        valueType: 'String',
        data: {
          [s652_sampleId]: '321-05',
          [s663_sampleId]: '321-04',
          [s664_sampleId]: '321-04',
        },
      },
      {
        id: metaColumnTissueId,
        label: 'Tissue',
        global: true,
        valueType: 'String',
        data: {
          [s652_sampleId]: 'Plasmablasts',
          [s663_sampleId]: 'PBMC',
          [s664_sampleId]: 'Plasmablasts',
        },
      },
      {
        id: metaColumnDayAfterVaccinationId,
        label: 'Day after vaccination',
        global: false,
        valueType: 'Long',
        data: {
          [s652_sampleId]: 5,
          [s663_sampleId]: 0,
          [s664_sampleId]: 5,
        },
      },
    ],
    sampleIds: [s652_sampleId, s663_sampleId, s664_sampleId],
    sampleLabelColumnLabel: 'Sample Name',
    sampleLabels: { [s652_sampleId]: 'SRR11233652', [s663_sampleId]: 'SRR11233663', [s664_sampleId]: 'SRR11233664' },
    datasets: [{
      id: dataset1Id,
      label: 'Dataset 1',
      content: {
        type: 'Fastq',
        readIndices: ['R1', 'R2'],
        gzipped: true,
        data: {
          [s652_sampleId]: {
            R1: s652_r1Handle,
            R2: s652_r2Handle,
          },
          [s663_sampleId]: {
            R1: s663_r1Handle,
            R2: s663_r2Handle,
          },
          [s664_sampleId]: {
            R1: s664_r1Handle,
            R2: s664_r2Handle,
          },
        },
      },
    }],
    h5adFilesToPreprocess: [],
    seuratFilesToPreprocess: [],
  } satisfies SamplesAndDataBlockArgs);
  await project.runBlock(sndBlockId);
  await helpers.awaitBlockDone(sndBlockId, 100000);

  const sdnStableState1 = await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);
  expect(sdnStableState1.outputs).toMatchObject({
    fileImports: { ok: true, value: { [s652_r1Handle]: { done: true }, [s652_r2Handle]: { done: true }, [s663_r1Handle]: { done: true }, [s663_r2Handle]: { done: true }, [s664_r1Handle]: { done: true }, [s664_r2Handle]: { done: true } } },
  });

  const clonotypingBlockState = project.getBlockState(clonotypingBlockId);
  const clonotypingStableState1 = (await awaitStableState(
    clonotypingBlockState,
    200000,
  )) as InferBlockState<typeof mixcrPlatforma>;

  expect(clonotypingStableState1.outputs).toMatchObject({
    inputOptions: {
      ok: true,
      value: [
        {
          label: 'Dataset 1',
        },
      ],
    },
  });

  const clonotypingStableState1Outputs = wrapOutputs<MiXCRClonotypingBlockOutputs>(clonotypingStableState1.outputs);
  expect(clonotypingStableState1Outputs.presets).toBeDefined();

  const presets = SupportedPresetList.parse(
    JSON.parse(
      Buffer.from(
        await ml.driverKit.blobDriver.getContent(clonotypingStableState1Outputs.presets!.handle),
      ).toString(),
    ),
  );
  expect(presets).length.gt(10);

  await project.setBlockArgs(clonotypingBlockId, {
    input: clonotypingStableState1Outputs.inputOptions[0].ref,
    preset: { type: 'name', name: 'neb-human-rna-xcr-umi-nebnext' },
    chains: ['IGHeavy'],
  } satisfies MiXCRClonotypingBlockArgs);

  const clonotypingStableState2 = (await awaitStableState(
    project.getBlockState(clonotypingBlockId),
    25000,
  )) as InferBlockState<typeof mixcrPlatforma>;

  const outputs2 = wrapOutputs<MiXCRClonotypingBlockOutputs>(clonotypingStableState2.outputs);
  expect(outputs2.sampleLabels![s652_sampleId]).toBeDefined();

  await project.runBlock(clonotypingBlockId);
  const clonotypingStableState3 = (await helpers.awaitBlockDoneAndGetStableBlockState<typeof mixcrPlatforma>(
    clonotypingBlockId,
    200000,
  ));
  const outputs3 = wrapOutputs<MiXCRClonotypingBlockOutputs>(clonotypingStableState3.outputs);
  expect(outputs3.reports.isComplete).toEqual(true);

  const annotationStableState1 = (await awaitStableState(
    project.getBlockState(annotationBlockId),
    300000,
  )) as InferBlockState<typeof platforma>;
  const outputs4 = wrapOutputs<BlockOutputs>(annotationStableState1.outputs);
  expect(outputs4.inputOptions).toBeDefined();
  expect(outputs4.inputOptions).toHaveLength(1);

  return {
    ml,
    project,
    helpers,
    expect,
    sndBlockId,
    clonotypingBlockId,
    annotationBlockId,
    s652_sampleId,
    s663_sampleId,
    s664_sampleId,
    clonotypingStableState3,
    annotationStableState1,
    outputs4,
  };
}

// Find column helper
function findColumnId(columns: SimplifiedUniversalPColumnEntry[] | undefined, labelOrPredicate: string | ((label: string) => boolean)): SUniversalPColumnId | undefined {
  if (!columns) return undefined;
  const predicate = typeof labelOrPredicate === 'string' ? (label: string) => label === labelOrPredicate : labelOrPredicate;
  return columns.find((col) => predicate(col.label))?.id as SUniversalPColumnId;
}

// Test for byClonotype mode
blockTest(
  'simple project byClonotype mode',
  { timeout: 300000 },
  async ({ rawPrj: project, ml, helpers, expect }) => {
    const {
      annotationBlockId, outputs4,
    } = await setupProject({ rawPrj: project, ml, helpers, expect });

    // Initial annotation block state set to trigger column calculation
    await project.setBlockArgs(annotationBlockId, {
      inputAnchor: outputs4.inputOptions[0].ref,
      annotationScript: {
        title: 'My Annotation',
        mode: 'byClonotype',
        steps: [],
      } satisfies AnnotationScript,
      runExportAll: false,
    } satisfies BlockArgs);

    const annotationStableState2 = (await awaitStableState(
      project.getBlockState(annotationBlockId),
      300000,
    )) as InferBlockState<typeof platforma>;

    const outputs5 = wrapOutputs<BlockOutputs>(annotationStableState2.outputs);
    console.dir({ byClonotypeColumns: outputs5.byClonotypeColumns?.columns }, { depth: 8 });

    // Find column IDs from byClonotypeColumns
    const readCount652Column = findColumnId(outputs5.byClonotypeColumns?.columns, (l) => l.includes('Number Of Reads / SRR11233652'));
    const readFraction652Column = findColumnId(outputs5.byClonotypeColumns?.columns, (l) => l.includes('Fraction of reads / SRR11233652'));
    const readFraction664Column = findColumnId(outputs5.byClonotypeColumns?.columns, (l) => l.includes('Fraction of reads / SRR11233664'));
    const vGeneColumn = findColumnId(outputs5.byClonotypeColumns?.columns, 'Best V gene');

    // Ensure all column references are defined before using them
    expect(readCount652Column, 'Read Count 652 Column').toBeDefined();
    expect(readFraction652Column, 'Read Fraction 652 Column').toBeDefined();
    expect(readFraction664Column, 'Read Fraction 664 Column').toBeDefined();
    expect(vGeneColumn, 'V Gene Column').toBeDefined();

    // Type guard not strictly necessary after expect.toBeDefined but good practice
    if (!readCount652Column || !readFraction652Column || !readFraction664Column || !vGeneColumn) {
      throw new Error('Required column references are undefined');
    }

    // Cast to SUniversalPColumnId after checks

    const annotationScript: AnnotationScript = {
      title: 'My Annotation',
      mode: 'byClonotype',
      steps: [
        {
          filter: {
            type: 'and',
            filters: [
              { type: 'numericalComparison', lhs: 1, rhs: readCount652Column },
              { type: 'numericalComparison', lhs: readCount652Column, rhs: 1000 },
            ],
          },
          label: 'Medium Read Count (Sample 652)',
        },
        {
          filter: { type: 'numericalComparison', lhs: readFraction664Column, rhs: readFraction652Column, minDiff: 0.01 },
          label: 'Significantly More Abundant in Sample 652',
        },
        {
          filter: { type: 'pattern', column: vGeneColumn, predicate: { type: 'containSubsequence', value: 'IGHV3' } },
          label: 'IGHV3 Family',
        },
        {
          filter: { type: 'numericalComparison', lhs: { transformer: 'rank', column: readCount652Column, descending: true }, rhs: 2, allowEqual: true },
          label: 'Top 2 by Read Count (Sample 652)',
        },
        {
          filter: { type: 'numericalComparison', lhs: { transformer: 'sortedCumulativeSum', column: readFraction664Column, descending: true }, rhs: 0.5, allowEqual: true },
          label: 'Top 50% by Read Fraction (Sample 664)',
        },
      ],
    };

    await project.setBlockArgs(annotationBlockId, {
      inputAnchor: outputs5.inputOptions[0].ref,
      annotationScript,
      runExportAll: false,
    } satisfies BlockArgs);

    const annotationStableState3 = (await awaitStableState(
      project.getBlockState(annotationBlockId),
      300000,
    )) as InferBlockState<typeof platforma>;

    const outputs6 = wrapOutputs<BlockOutputs>(annotationStableState3.outputs);
    console.dir({ byClonotypeOutputs: outputs6 }, { depth: 8 });

    expect(outputs6.overlapTable, 'Overlap Table').toBeDefined();
    expect(outputs6.statsTable, 'Stats Table').toBeDefined();

    const columnSpecs = await ml.driverKit.pFrameDriver.getSpec(outputs6.overlapTable!.fullTableHandle);
    // console.dir({ byClonotypeColSpecs: columnSpecs }, { depth: 8 });
    const annotationIdx = columnSpecs.findIndex((col) => col.spec.name === 'pl7.app/vdj/annotation');
    expect(annotationIdx, 'Annotation Column Index').toBeGreaterThanOrEqual(0);

    const annotationData = await ml.driverKit.pFrameDriver.getData(outputs6.overlapTable!.fullTableHandle, [annotationIdx]);
    expect(annotationData[0].data, 'Annotation Data').toBeDefined();
    expect(annotationData[0].data.length, 'Annotation Data Length').toBeGreaterThan(0);
    expect(annotationData[0].data.some((val) => Boolean(val?.toString()?.startsWith('Top 2'))), 'Annotation contains "Top 2"').toBe(true);

    const statsShape = await ml.driverKit.pFrameDriver.getShape(outputs6.statsTable!.fullTableHandle);
    const statsData = await ml.driverKit.pFrameDriver.getData(outputs6.statsTable!.fullTableHandle, [...Array(statsShape.columns).keys()]);
    console.dir({ byClonotypeStatsData: statsData }, { depth: 8 });

    expect(statsData[0].data, 'Stats Data').toBeDefined();
    expect(statsData[0].data.length, 'Stats Data Length').toBeGreaterThan(0);
  },
);

// Test for bySampleAndClonotype mode
blockTest(
  'simple project bySampleAndClonotype mode',
  { timeout: 300000 },
  async ({ rawPrj: project, ml, helpers, expect }) => {
    const {
      annotationBlockId, outputs4, // s652_sampleId, s664_sampleId,
    } = await setupProject({ rawPrj: project, ml, helpers, expect });

    // Initial annotation block state set to trigger column calculation
    await project.setBlockArgs(annotationBlockId, {
      inputAnchor: outputs4.inputOptions[0].ref,
      annotationScript: {
        title: 'My Annotation',
        mode: 'bySampleAndClonotype', // Change mode here
        steps: [],
      } satisfies AnnotationScript,
      runExportAll: false,
    } satisfies BlockArgs);

    const annotationStableState2 = (await awaitStableState(
      project.getBlockState(annotationBlockId),
      300000,
    )) as InferBlockState<typeof platforma>;

    const outputs5 = wrapOutputs<BlockOutputs>(annotationStableState2.outputs);
    console.dir({ bySampleAndClonotypeColumns: outputs5.bySampleAndClonotypeColumns }, { depth: 8 });

    // Find column IDs from bySampleAndClonotypeColumns
    // Note: In this mode, columns represent values per sample-clonotype pair directly
    const readCountColumn = findColumnId(outputs5.bySampleAndClonotypeColumns?.columns, 'Number Of Reads');
    const readFractionColumn = findColumnId(outputs5.bySampleAndClonotypeColumns?.columns, 'Fraction of reads');
    // Find V gene from byClonotypeColumns (still available, represents clonotype property)
    const vGeneColumn = findColumnId(outputs5.byClonotypeColumns?.columns, 'Best V gene');

    expect(readCountColumn, 'Read Count Column').toBeDefined();
    expect(readFractionColumn, 'Read Fraction Column').toBeDefined();
    expect(vGeneColumn, 'V Gene Column').toBeDefined();

    if (!readCountColumn || !readFractionColumn || !vGeneColumn) {
      throw new Error('Required column references are undefined');
    }

    // Define annotation steps using bySampleAndClonotype specific filters
    const annotationScript: AnnotationScript = {
      title: 'My Annotation',
      mode: 'bySampleAndClonotype',
      steps: [
        {
          filter: { // Filter reads within each sample independently
            type: 'and',
            filters: [
              { type: 'numericalComparison', lhs: 1, rhs: readCountColumn },
              { type: 'numericalComparison', lhs: readCountColumn, rhs: 1000 },
            ],
          },
          label: 'Medium Read Count (Per Sample)',
        },
        {
          filter: { // Filter based on V gene family (clonotype property)
            type: 'pattern', column: vGeneColumn, predicate: { type: 'containSubsequence', value: 'IGHV3' },
          },
          label: 'IGHV3 Family',
        },
        {
          filter: { // Rank within each sample
            type: 'numericalComparison',
            lhs: { transformer: 'rank', column: readCountColumn, descending: true },
            rhs: 2,
            allowEqual: true,
          },
          label: 'Top 2 by Read Count (Per Sample)',
        },
        {
          filter: { // Cumulative sum within each sample
            type: 'numericalComparison',
            lhs: { transformer: 'sortedCumulativeSum', column: readFractionColumn, descending: true },
            rhs: 0.5,
            allowEqual: true,
          },
          label: 'Top 50% by Read Fraction (Per Sample)',
        },
        // Example of IsNA filter (though less interesting with required read count filter above)
        // {
        //   filter: { type: 'isNA', column: readCountColumn },
        //   label: 'Present in Sample (isNA check - should not appear)',
        // }
      ],
    };

    await project.setBlockArgs(annotationBlockId, {
      inputAnchor: outputs5.inputOptions[0].ref,
      annotationScript,
      runExportAll: false,
    } satisfies BlockArgs);

    const annotationStableState3 = (await awaitStableState(
      project.getBlockState(annotationBlockId),
      300000,
    )) as InferBlockState<typeof platforma>;

    const outputs6 = wrapOutputs<BlockOutputs>(annotationStableState3.outputs);
    console.dir({ bySampleAndClonotypeOutputs: outputs6 }, { depth: 8 });

    expect(outputs6.overlapTable, 'Overlap Table').toBeDefined();
    expect(outputs6.statsTable, 'Stats Table').toBeDefined();

    // --- Assertions for bySampleAndClonotype ---
    // const columnSpecs = await ml.driverKit.pFrameDriver.getSpec(outputs6.table!);
    // console.dir({ bySampleAndClonotypeColSpecs: columnSpecs }, { depth: 8 });

    // Check for sample ID column and annotation column
    // const annotationIdx = columnSpecs.findIndex((col) => col.spec.name === 'pl7.app/vdj/annotation');
    // expect(annotationIdx, 'Annotation Column Index').toBeGreaterThanOrEqual(0);

    // Fetch Sample ID and Annotation data
    // const data = await ml.driverKit.pFrameDriver.getData(outputs6.table!, [annotationIdx]);
    // const annotationData = data[0].data;

    // expect(annotationData, 'Annotation Data').toBeDefined();
    // expect(annotationData.length, 'Annotation Data Length').toBeGreaterThan(0);

    // Check if a specific label is present
    // expect(annotationData.some((val) => Boolean(val?.toString()?.startsWith('Top 2'))), 'Annotation contains "Top 2"').toBe(true);

    // Check Stats Table
    const statsShape = await ml.driverKit.pFrameDriver.getShape(outputs6.statsTable!.fullTableHandle);
    const statsData = await ml.driverKit.pFrameDriver.getData(outputs6.statsTable!.fullTableHandle, [...Array(statsShape.columns).keys()]);
    console.dir({ bySampleAndClonotypeStatsData: statsData }, { depth: 8 });

    expect(statsData[0].data, 'Stats Data').toBeDefined();
    expect(statsData[0].data.length, 'Stats Data Length').toBeGreaterThan(0);
    // Further stats table assertions could go here (e.g., check presence of expected labels)
  },
);
