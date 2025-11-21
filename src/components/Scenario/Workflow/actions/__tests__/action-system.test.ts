/**
 * Action System Integration Tests
 * Tests that all actions are properly registered and can be executed
 */

/* eslint-env jest */

import { getActionClass, getAllActionTypes } from '../index';

describe('Action System', () => {
  describe('Registration', () => {
    it('should register all 12 actions', () => {
      const actionTypes = getAllActionTypes();
      expect(actionTypes).toHaveLength(12);
    });

    it('should register all content actions', () => {
      const actionTypes = getAllActionTypes();
      expect(actionTypes).toContain('add');
      expect(actionTypes).toContain('add-text');
      expect(actionTypes).toContain('new_chapter');
      expect(actionTypes).toContain('new_section');
      expect(actionTypes).toContain('new_step');
      expect(actionTypes).toContain('comment-result');
    });

    it('should register all code actions', () => {
      const actionTypes = getAllActionTypes();
      expect(actionTypes).toContain('exec');
      expect(actionTypes).toContain('set_effect_as_thinking');
    });

    it('should register all thinking actions', () => {
      const actionTypes = getAllActionTypes();
      expect(actionTypes).toContain('is_thinking');
      expect(actionTypes).toContain('finish_thinking');
    });

    it('should register all workflow actions', () => {
      const actionTypes = getAllActionTypes();
      expect(actionTypes).toContain('update_title');
      expect(actionTypes).toContain('update_last_text');
    });
  });

  describe('Action Classes', () => {
    it('should return action class for valid action type', () => {
      const AddAction = getActionClass('add');
      expect(AddAction).toBeDefined();
      expect(AddAction?.actionType).toBe('add');
    });

    it('should return undefined for invalid action type', () => {
      const InvalidAction = getActionClass('invalid_action');
      expect(InvalidAction).toBeUndefined();
    });

    it('should have correct class names', () => {
      const AddAction = getActionClass('add');
      expect(AddAction?.name).toBe('AddAction');

      const ExecCodeAction = getActionClass('exec');
      expect(ExecCodeAction?.name).toBe('ExecCodeAction');
    });
  });

  describe('Action Execution Interface', () => {
    it('all actions should have execute method', () => {
      const actionTypes = getAllActionTypes();

      actionTypes.forEach((actionType) => {
        const ActionClass = getActionClass(actionType);
        expect(ActionClass).toBeDefined();

        // Check if class has execute method
        const mockScriptStore = {
          addCell: jest.fn(),
          updateTitle: jest.fn(),
          updateLastText: jest.fn(),
          finishThinking: jest.fn(),
          setEffectAsThinking: jest.fn(),
          execCodeCell: jest.fn(),
          lastAddedActionId: 'test-id',
        };

        const instance = new ActionClass!(mockScriptStore);
        expect(instance.execute).toBeDefined();
        expect(typeof instance.execute).toBe('function');
      });
    });
  });

  describe('Backend Protocol Match', () => {
    it('should match Python backend action types', () => {
      const expectedActions = [
        'add',
        'add-text',
        'new_chapter',
        'new_section',
        'new_step',
        'comment-result',
        'exec',
        'set_effect_as_thinking',
        'is_thinking',
        'finish_thinking',
        'update_title',
        'update_last_text',
      ];

      const actionTypes = getAllActionTypes();
      expectedActions.forEach((expected) => {
        expect(actionTypes).toContain(expected);
      });
    });
  });
});

describe('Action Execution', () => {
  let mockScriptStore: any;

  beforeEach(() => {
    mockScriptStore = {
      addCell: jest.fn(() => 'test-cell-id'),
      updateTitle: jest.fn(),
      updateLastText: jest.fn(),
      finishThinking: jest.fn(),
      setEffectAsThinking: jest.fn(),
      execCodeCell: jest.fn(() => Promise.resolve({ success: true })),
      lastAddedActionId: 'last-cell-id',
    };
  });

  describe('AddAction', () => {
    it('should create markdown cell for markdown shot_type', () => {
      const AddAction = getActionClass('add')!;
      const action = new AddAction(mockScriptStore);

      action.execute({
        action: 'add',
        content: 'Test content',
        shotType: 'markdown',
      });

      expect(mockScriptStore.addCell).toHaveBeenCalledWith('text', 'Test content', undefined);
    });

    it('should create code cell for action shot_type', () => {
      const AddAction = getActionClass('add')!;
      const action = new AddAction(mockScriptStore);

      action.execute({
        action: 'add',
        content: 'print("hello")',
        shotType: 'action',
      });

      expect(mockScriptStore.addCell).toHaveBeenCalledWith('code', 'print("hello")', undefined);
    });
  });

  describe('ExecCodeAction', () => {
    it('should execute code cell', async () => {
      const ExecCodeAction = getActionClass('exec')!;
      const action = new ExecCodeAction(mockScriptStore);

      await action.execute({
        action: 'exec',
        codecell_id: 'test-cell',
        need_output: true,
        auto_debug: false,
      });

      expect(mockScriptStore.execCodeCell).toHaveBeenCalledWith('test-cell', true, false);
    });

    it('should use lastAddedCellId when codecell_id is lastAddedCellId', async () => {
      const ExecCodeAction = getActionClass('exec')!;
      const action = new ExecCodeAction(mockScriptStore);

      await action.execute({
        action: 'exec',
        codecell_id: 'lastAddedCellId',
      });

      expect(mockScriptStore.execCodeCell).toHaveBeenCalledWith('last-cell-id', true, false);
    });
  });

  describe('UpdateTitleAction', () => {
    it('should update notebook title', () => {
      const UpdateTitleAction = getActionClass('update_title')!;
      const action = new UpdateTitleAction(mockScriptStore);

      action.execute({
        action: 'update_title',
        title: 'New Title',
      });

      expect(mockScriptStore.updateTitle).toHaveBeenCalledWith('New Title');
    });
  });
});

console.log('[Tests] Action system tests defined');
