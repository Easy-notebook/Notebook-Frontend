// LibraryState/StorageCleanupTool.tsx
// Debug tool for cleaning up old cell files and testing storage

import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Typography, Alert, Spin, Statistic, Row, Col } from 'antd';
import { DeleteOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import StorageCleanup from '@Services/storageCleanup';

const { Title, Text, Paragraph } = Typography;

interface CleanupStats {
  notebooksWithCellFiles: number;
  totalCellFiles: number;
  totalSizeKB: number;
}

export const StorageCleanupTool: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ cleaned: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const statistics = await StorageCleanup.getCellFileStatistics();
      setStats(statistics);
    } catch (err) {
      setError(`Failed to load statistics: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    try {
      setLoading(true);
      setError(null);
      setCleanupResult(null);
      
      const result = await StorageCleanup.cleanupAllNotebookCellFiles();
      setCleanupResult(result);
      
      // Refresh stats after cleanup
      await loadStats();
    } catch (err) {
      setError(`Failed to run cleanup: ${err}`);
    } finally {
      setLoading(false);
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
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
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

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            showIcon
          />
        )}

        {cleanupResult && (
          <Alert
            message="Cleanup Complete"
            description={`Successfully cleaned ${cleanupResult.cleaned} files with ${cleanupResult.errors} errors.`}
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
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadStats}
            loading={loading}
          >
            Refresh Stats
          </Button>
          
          <Button 
            type="primary"
            danger
            icon={<DeleteOutlined />}
            onClick={runCleanup}
            loading={loading}
            disabled={!stats || stats.totalCellFiles === 0}
          >
            Clean Up Cell Files
          </Button>
        </Space>

        <Paragraph style={{ fontSize: '12px', color: '#666', marginBottom: 0 }}>
          <strong>Note:</strong> This cleanup is safe and only removes old cell fragment files. 
          Your notebook content is preserved in the main .easynb files.
        </Paragraph>
      </Space>
    </Card>
  );
};

export default StorageCleanupTool;