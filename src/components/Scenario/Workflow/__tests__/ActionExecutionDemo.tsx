/**
 * Action Execution Demo Component
 * ================================
 *
 * A simple UI component to test action execution at the component level.
 * This allows you to verify that actions from the backend can be executed properly.
 *
 * Usage:
 * 1. Import this component in your app
 * 2. Render it somewhere (e.g., in a test page)
 * 3. Click buttons to test different action types
 * 4. Check console and notebook cells to verify execution
 *
 * Example:
 * ```tsx
 * import ActionExecutionDemo from '@/components/Scenario/Workflow/__tests__/ActionExecutionDemo';
 *
 * function TestPage() {
 *   return <ActionExecutionDemo />;
 * }
 * ```
 */

import React, { useState, useEffect } from 'react';
import { Button, Card, Space, Tag, message, Divider } from 'antd';
import {
  PlayCircleOutlined,
  FileTextOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useScriptStore } from '../store/useScriptStore';
import {
  testActionExecution,
  testActionFlow,
  createMockAction,
  verifyActionExecutionCapabilities,
} from './action-execution-test';
import workflowInit from '../utils/workflowInitializer';

const ActionExecutionDemo: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<
    Array<{ action: string; status: 'success' | 'error'; message: string }>
  >([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  useEffect(() => {
    // Initialize workflow system on mount
    console.log('[ActionDemo] Initializing workflow system...');
    try {
      workflowInit.initializeWorkflowSystem();
      const status = workflowInit.verifyWorkflowSystemInit();
      setSystemStatus(status);
      console.log('[ActionDemo] System initialized:', status);
    } catch (error) {
      console.error('[ActionDemo] Initialization failed:', error);
    }
  }, []);

  const executeAction = async (actionType: string, mockType: string) => {
    setLoading(actionType);
    try {
      const action = createMockAction(mockType);
      console.log(`[ActionDemo] Executing ${actionType}:`, action);

      await testActionExecution(action);

      setResults((prev) => [
        ...prev,
        {
          action: actionType,
          status: 'success',
          message: 'Executed successfully',
        },
      ]);
      message.success(`${actionType} executed successfully`);
    } catch (error: any) {
      console.error(`[ActionDemo] ${actionType} failed:`, error);
      setResults((prev) => [
        ...prev,
        {
          action: actionType,
          status: 'error',
          message: error.message || 'Execution failed',
        },
      ]);
      message.error(`${actionType} failed`);
    } finally {
      setLoading(null);
    }
  };

  const runFullFlow = async () => {
    setLoading('flow');
    setResults([]);
    try {
      console.log('[ActionDemo] Running full action flow...');

      const actions = [
        createMockAction('chapter', { content: 'Chapter 1: Test Chapter' }),
        createMockAction('add-text', { content: 'This is a test text cell.' }),
        createMockAction('section', { content: 'Section 1.1: Test Section' }),
        createMockAction('add-code', { content: 'print("Hello from demo")' }),
      ];

      await testActionFlow(actions);

      setResults([
        {
          action: 'Full Flow',
          status: 'success',
          message: `${actions.length} actions executed successfully`,
        },
      ]);
      message.success('Full action flow completed successfully');
    } catch (error: any) {
      console.error('[ActionDemo] Flow failed:', error);
      setResults([
        {
          action: 'Full Flow',
          status: 'error',
          message: error.message || 'Flow execution failed',
        },
      ]);
      message.error('Action flow failed');
    } finally {
      setLoading(null);
    }
  };

  const runVerification = async () => {
    setLoading('verify');
    setResults([]);
    try {
      console.log('[ActionDemo] Running capability verification...');
      await verifyActionExecutionCapabilities();

      setResults([
        {
          action: 'Verification',
          status: 'success',
          message: 'All action types verified successfully',
        },
      ]);
      message.success('Action execution capabilities verified');
    } catch (error: any) {
      console.error('[ActionDemo] Verification failed:', error);
      setResults([
        {
          action: 'Verification',
          status: 'error',
          message: error.message || 'Verification failed',
        },
      ]);
      message.error('Capability verification failed');
    } finally {
      setLoading(null);
    }
  };

  const verifySystem = () => {
    const status = workflowInit.verifyWorkflowSystemInit();
    setSystemStatus(status);

    if (status.initialized) {
      message.success('System is properly initialized');
    } else {
      message.warning(`System has issues: ${status.issues.join(', ')}`);
    }
  };

  return (
    <Card
      title="🧪 Action Execution Demo"
      style={{ maxWidth: 1200, margin: '20px auto' }}
      extra={
        <Tag color={systemStatus?.initialized ? 'success' : 'warning'}>
          {systemStatus?.initialized ? 'System Ready' : 'Not Initialized'}
        </Tag>
      }
    >
      {/* System Status */}
      <Card size="small" title="System Status" style={{ marginBottom: 16 }}>
        <Space>
          <Tag color={systemStatus?.hasAsyncAdapter ? 'success' : 'error'}>
            AsyncAdapter: {systemStatus?.hasAsyncAdapter ? '✓' : '✗'}
          </Tag>
          <Tag color={systemStatus?.hasScriptStore ? 'success' : 'error'}>
            ScriptStore: {systemStatus?.hasScriptStore ? '✓' : '✗'}
          </Tag>
          <Tag color={systemStatus?.hasCoordinator ? 'success' : 'error'}>
            Coordinator: {systemStatus?.hasCoordinator ? '✓' : '✗'}
          </Tag>
          <Button size="small" onClick={verifySystem}>
            Verify System
          </Button>
        </Space>
        {systemStatus?.issues && systemStatus.issues.length > 0 && (
          <div style={{ marginTop: 8, color: '#ff4d4f' }}>
            Issues: {systemStatus.issues.join(', ')}
          </div>
        )}
      </Card>

      <Divider>Individual Actions</Divider>

      {/* Individual Action Tests */}
      <Space wrap>
        <Button
          icon={<FileTextOutlined />}
          loading={loading === 'text'}
          onClick={() => executeAction('Add Text Cell', 'add-text')}
        >
          Add Text Cell
        </Button>

        <Button
          icon={<CodeOutlined />}
          loading={loading === 'code'}
          onClick={() => executeAction('Add Code Cell', 'add-code')}
        >
          Add Code Cell
        </Button>

        <Button
          icon={<FileTextOutlined />}
          loading={loading === 'chapter'}
          onClick={() => executeAction('Add Chapter', 'chapter')}
        >
          Add Chapter
        </Button>

        <Button
          icon={<FileTextOutlined />}
          loading={loading === 'section'}
          onClick={() => executeAction('Add Section', 'section')}
        >
          Add Section
        </Button>

        <Button
          icon={<ThunderboltOutlined />}
          loading={loading === 'thinking'}
          onClick={() => executeAction('Thinking Cell', 'thinking')}
        >
          Thinking Cell
        </Button>
      </Space>

      <Divider>Action Flows</Divider>

      {/* Flow Tests */}
      <Space>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={loading === 'flow'}
          onClick={runFullFlow}
        >
          Run Full Action Flow
        </Button>

        <Button
          icon={<CheckCircleOutlined />}
          loading={loading === 'verify'}
          onClick={runVerification}
        >
          Verify All Capabilities
        </Button>
      </Space>

      {/* Results */}
      {results.length > 0 && (
        <>
          <Divider>Results</Divider>
          <div>
            {results.map((result, index) => (
              <div key={index} style={{ marginBottom: 8 }}>
                {result.status === 'success' ? (
                  <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                )}
                <strong>{result.action}:</strong> {result.message}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Instructions */}
      <Divider>Instructions</Divider>
      <div style={{ fontSize: 12, color: '#666' }}>
        <p>1. Verify system status shows all components as ready (✓)</p>
        <p>2. Click individual action buttons to test specific action types</p>
        <p>3. Click &quot;Run Full Action Flow&quot; to test a sequence of actions</p>
        <p>4. Click &quot;Verify All Capabilities&quot; to run comprehensive tests</p>
        <p>5. Check the console for detailed logs</p>
        <p>6. Check the notebook for created cells</p>
      </div>

      {/* Browser Console Access */}
      <Divider>Developer Tools</Divider>
      <div
        style={{
          fontSize: 12,
          color: '#666',
          backgroundColor: '#f5f5f5',
          padding: 12,
          borderRadius: 4,
        }}
      >
        <p style={{ margin: 0, marginBottom: 8 }}>
          <strong>Available in browser console:</strong>
        </p>
        <code style={{ display: 'block', marginBottom: 4 }}>
          window.actionTest.testActionExecution(action)
        </code>
        <code style={{ display: 'block', marginBottom: 4 }}>window.workflowInit.verify()</code>
        <code style={{ display: 'block' }}>window.workflowInit.testExecution()</code>
      </div>
    </Card>
  );
};

export default ActionExecutionDemo;
