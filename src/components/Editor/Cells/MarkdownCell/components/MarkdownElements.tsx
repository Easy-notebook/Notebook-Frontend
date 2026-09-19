import React from 'react';
import type { ExtraProps } from 'react-markdown';

type MarkdownImageProps = React.ComponentPropsWithoutRef<'img'> & ExtraProps;

export const MarkdownImage: React.FC<MarkdownImageProps> = ({
  node: _node, loading = 'lazy', decoding = 'async', style, ...props
}) => (
  <span style={{ display: 'block', textAlign: 'center' }}>
    <img
      {...props}
      loading={loading}
      decoding={decoding}
      style={{ maxWidth: '100%', height: 'auto', display: 'inline-block', ...style }}
    />
  </span>
);

type MarkdownTableProps = React.ComponentPropsWithoutRef<'table'> & ExtraProps;
export const MarkdownTable: React.FC<MarkdownTableProps> = ({ node: _node, children, ...props }) => (
  <div
    className="table-container"
    style={{ display: 'block', overflowX: 'auto', margin: '1rem 0' }}
  >
    <table
      {...props}
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        minWidth: '300px',
        ...props.style,
      }}
    >
      {children}
    </table>
  </div>
);

type MarkdownTableRowProps = React.ComponentPropsWithoutRef<'tr'> & ExtraProps;
export const MarkdownTableRow: React.FC<MarkdownTableRowProps> = ({ node: _node, children, ...props }) => (
  <tr {...props}>{children}</tr>
);

type MarkdownTableCellProps = React.ComponentPropsWithoutRef<'td'> & ExtraProps;
export const MarkdownTableCell: React.FC<MarkdownTableCellProps> = ({ node: _node, children, ...props }) => (
  <td
    {...props}
    style={{
      padding: '8px 12px',
      border: '1px solid #e2e8f0',
      ...props.style,
    }}
  >
    {children}
  </td>
);

type MarkdownTableHeadProps = React.ComponentPropsWithoutRef<'th'> & ExtraProps;
export const MarkdownTableHead: React.FC<MarkdownTableHeadProps> = ({ node: _node, children, ...props }) => (
  <th
    {...props}
    style={{
      padding: '12px',
      border: '1px solid #e2e8f0',
      backgroundColor: '#f8fafc',
      fontWeight: 600,
      ...props.style,
    }}
  >
    {children}
  </th>
);
