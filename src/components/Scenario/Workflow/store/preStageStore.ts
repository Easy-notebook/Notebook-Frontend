/**
 * @file preStageStore.ts
 * @description Pre-stage store for managing dataset upload and problem definition state.
 *
 * This store manages the UI state BEFORE the workflow is initialized.
 * Once the workflow starts, the PipelineStore and WorkflowStateMachine take over.
 *
 * @author Hu Silan
 * @project Easy-notebook
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { analyzeDatasetStructure } from '../utils/dataAnalysis';
import type { PreStageState, PreStageStore } from '@Store/models';

// Types moved to @Store/models

// ==============================================
// INITIAL STATE
// ==============================================

const initialState: PreStageState = {
  currentFile: null,
  isUploading: false,
  csv_file_path: '',
  choiceMap: [],
  problem_description: '',
  context_description: '',
  dataBackground: '',
  problem_name: '',
  file_columns: [],
  selectedProblemType: null,
  selectedTarget: null,
  datasetInfo: '',
};

// ==============================================
// ZUSTAND STORE
// ==============================================

const usePreStageStore = create<PreStageStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ==============================================
    // Getters
    // ==============================================
    getDataBackground: () => get().dataBackground,
    getCurrentFile: () => get().currentFile,
    getIsUploading: () => get().isUploading,
    getFileColumns: () => get().file_columns,
    getDatasetInfo: () => get().datasetInfo,
    getCurrentChoiceMap: () => get().choiceMap,
    getProblemName: () => get().problem_name,

    // ==============================================
    // Actions
    // ==============================================
    setCurrentFile: async (file: File | null) => {
      if (get().isUploading) {
        console.warn('[PreStageStore] Already uploading, cannot set new file');
        return;
      }

      if (!file) {
        set({ currentFile: null });
        return;
      }

      set({ currentFile: file, isUploading: true });

      try {
        const result = await analyzeDatasetStructure(file);
        if (!result) {
          throw new Error('Failed to analyze dataset structure');
        }

        const { columns, metadata } = result;

        // Convert metadata object to descriptive string for API
        const datasetInfoString =
          `Dataset contains ${metadata.rowCount} rows and ${metadata.columnCount} columns. ` +
          `Numeric columns (${metadata.numericColumns.length}): ${metadata.numericColumns.join(', ') || 'none'}. ` +
          `Categorical columns (${metadata.categoricalColumns.length}): ${metadata.categoricalColumns.join(', ') || 'none'}. ` +
          `Date columns (${metadata.dateColumns.length}): ${metadata.dateColumns.join(', ') || 'none'}.`;

        set({
          file_columns: columns,
          datasetInfo: datasetInfoString,
          isUploading: false,
        });
        console.log('[PreStageStore] Dataset analyzed successfully');
        console.log('[PreStageStore] Dataset info:', datasetInfoString);
      } catch (error) {
        console.error('[PreStageStore] Failed to analyze dataset:', error);
        set({ isUploading: false });
      }
    },

    setFileColumns: (columns: string[]) => set({ file_columns: columns }),
    setDataBackground: (background: string) => set({ dataBackground: background }),
    setDatasetInfo: (info: string) => set({ datasetInfo: info }),
    setIsUploading: (value: boolean) => set({ isUploading: value }),
    changeIsUploading: () => set((state) => ({ isUploading: !state.isUploading })),
    setCsvFilePath: (path: string) => set({ csv_file_path: path }),
    setProblemName: (name: string) => set({ problem_name: name }),
    setProblemDescription: (desc: string) => set({ problem_description: desc }),
    setContextDescription: (desc: string) => set({ context_description: desc }),

    setSelectedProblem: (target: string, description: string, problemName: string) =>
      set({
        selectedTarget: target,
        problem_description: description,
        problem_name: problemName,
      }),

    updateChoiceMap: (choiceMap: any[]) => {
      if (Array.isArray(choiceMap)) {
        set({ choiceMap });
      }
    },

    resetStore: () => {
      console.log('[PreStageStore] Resetting store');
      set(initialState);
    },
  }))
);

// ==============================================
// EXPORTS
// ==============================================

export default usePreStageStore;
