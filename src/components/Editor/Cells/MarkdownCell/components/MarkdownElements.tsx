import React from 'react';

interface MarkdownImageProps {
  alt?: string;
  src?: string;
  title?: string;
}

export const MarkdownImage: React.FC<MarkdownImageProps> = ({ alt, src, title }) => (
  <span style={{ display: 'block', textAlign: 'center' }}>
    <img
      src={src}
      alt={alt}
      title={title}
      style={{ maxWidth: '100%', height: 'auto', display: 'inline-block' }}
    />
  </span>
);

interface MarkdownTableProps {
  children: React.ReactNode;
  [key: string]: unknown;
}
export const MarkdownTable: React.FC<MarkdownTableProps> = ({ children, ...props }) => (
  <span
    className="table-container"
    style={{ display: 'block', overflowX: 'auto', margin: '1rem 0' }}
  >
    <table
      {...props}
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        minWidth: '300px',
      }}
    >
      {children}
    </table>
  </span>
);

interface MarkdownTableRowProps {
  children: React.ReactNode;
  [key: string]: unknown;
}
export const MarkdownTableRow: React.FC<MarkdownTableRowProps> = ({ children, ...props }) => (
  <tr {...props}>{children}</tr>
);

interface MarkdownTableCellProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  [key: string]: unknown;
}
export const MarkdownTableCell: React.FC<MarkdownTableCellProps> = ({ children, ...props }) => (
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

interface MarkdownTableHeadProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  [key: string]: unknown;
}
export const MarkdownTableHead: React.FC<MarkdownTableHeadProps> = ({ children, ...props }) => (
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
