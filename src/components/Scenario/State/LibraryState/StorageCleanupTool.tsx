// LibraryState/StorageCleanupTool.tsx
// Debug tool for cleaning up old cell files and testing storage

import React, { useEffect, useState } from 'react';
import { Button, Card, Progress, Statistic, Alert, Space, Typography, Spin, Row, Col } from 'antd';
import {
  DeleteOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import StorageCleanup from '@Services/storageCleanup';
import { usePersistence } from '../../../../services/persistence/PersistenceContext';

const { Title, Text, Paragraph } = Typography;

export const StorageCleanupTool: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [stats, setStats] = useState<{
    notebooksWithCellFiles: number;
    totalCellFiles: number;
    totalSizeKB: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<{ cleaned: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const persistence = usePersistence();

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const statistics = await StorageCleanup.getCellFileStatistics(persistence);
      setStats(statistics);
    } catch (err) {
      console.error('Failed to load statistics:', err);
      setError(`Failed to load statistics: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadStats();
    }
  }, [visible, persistence]);

  const runCleanup = async () => {
    setCleaning(true);
    setError(null);
    setResult(null);
    try {
      const cleanupResult = await StorageCleanup.cleanupAllNotebookCellFiles(persistence);
      setResult(cleanupResult);
      await loadStats();
    } catch (err) {
      console.error('Failed to cleanup:', err);
      setError(`Failed to cleanup: ${err}`);
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadStats();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Card
      title="Storage Cleanup Tool"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        zIndex: 1000,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert
          message="Storage Structure Fix"
          description="This tool cleans up old cell files created by the previous notebook storage system. Each notebook should only have one .easynb file."
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />

        {error && <Alert message="Error" description={error} type="error" showIcon />}

        {result && (
          <Alert
            message="Cleanup Complete"
            description={`Successfully cleaned ${result.cleaned} files with ${result.errors} errors.`}
            type="success"
            showIcon
          />
        )}

        <Spin spinning={loading}>
          {stats && (
            <Card size="small" title="Current Statistics">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Notebooks with Cell Files"
                    value={stats.notebooksWithCellFiles}
                    valueStyle={{ color: stats.notebooksWithCellFiles > 0 ? '#ff4d4f' : '#3f8600' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Total Cell Files"
                    value={stats.totalCellFiles}
                    valueStyle={{ color: stats.totalCellFiles > 0 ? '#ff4d4f' : '#3f8600' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Total Size"
                    value={stats.totalSizeKB}
                    suffix="KB"
                    valueStyle={{ color: stats.totalSizeKB > 0 ? '#ff4d4f' : '#3f8600' }}
                  />
                </Col>
              </Row>
            </Card>
          )}
        </Spin>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadStats} loading={loading}>
            Refresh Stats
          </Button>

          <Button
            type="primary"
            danger
            icon={<DeleteOutlined />}
            onClick={runCleanup}
            loading={loading || cleaning}
            disabled={!stats || stats.totalCellFiles === 0}
          >
            Clean Up Cell Files
          </Button>
        </Space>

        <Paragraph style={{ fontSize: '12px', color: '#666', marginBottom: 0 }}>
          <strong>Note:</strong> This cleanup is safe and only removes old cell fragment files. Your
          notebook content is preserved in the main .easynb files.
        </Paragraph>
      </Space>
    </Card>
  );
};

export default StorageCleanupTool;
