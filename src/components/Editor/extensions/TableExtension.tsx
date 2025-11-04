// 简化的表格扩展，专注于可靠的实时表格解析
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'

export const SimpleTableExtension = Extension.create({
  name: 'simpleTable',
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('simpleTableParser'),
        
        props: {
          // 处理键盘事件
          handleKeyDown(view, event) {
            const { state } = view;
            const { $from } = state.selection;
            
            // 检查是否在表格内
            const isInTable = isInsideTable($from);
            
            if (event.key === 'Enter' && !event.shiftKey) {
              // 普通回车：检测表格头创建
              const currentText = $from.parent.textContent.trim();
              console.log('Enter pressed, current text:', currentText);
              
              if (isTableHeader(currentText)) {
                console.log('Detected table header, creating table...');
                event.preventDefault();
                createTableFromHeader(view, currentText);
                return true;
              }
            } else if (event.key === 'Enter' && event.shiftKey && isInTable) {
              // Shift+Enter：在表格中创建新行
              console.log('Shift+Enter in table, adding new row...');
              event.preventDefault();
              addTableRow(view);
              return true;
            } else if (((event.key === 'Backspace' && event.shiftKey) || (event.key === 'Delete' && event.shiftKey)) && isInTable) {
              // Shift+Backspace (Mac向前删除) 或 Shift+Delete (其他系统向前删除)：删除当前行或整个表格
              console.log('Shift+Delete/Backspace in table...');
              event.preventDefault();
              const isHeader = isInTableHeader($from);
              if (isHeader) {
                console.log('Deleting entire table...');
                deleteEntireTable(view);
              } else {
                console.log('Deleting current row...');
                deleteCurrentRow(view);
              }
              return true;
            }
            return false;
          },
          
          // 处理文本输入
          handleTextInput(view, from, to, text) {
            // 当输入分隔符相关字符时检查
            if (text === '|' || text === '-') {
              setTimeout(() => {
                tryCreateTable(view);
              }, 50);
            }
            return false;
          }
        }
      })
    ]
  }
})

// 将函数移到插件外部，避免 this 引用问题
function tryCreateTable(view) {
  try {
    const { state } = view
    const { doc } = state
    
    // 收集所有段落
    const paragraphs = []
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        const text = node.textContent.trim()
        if (text) {
          paragraphs.push({
            text,
            pos,
            node,
            nodeSize: node.nodeSize
          })
        }
      }
    })
    
    console.log('Found paragraphs:', paragraphs.map(p => p.text))
    
    // 检查最后两个段落是否构成表格
    if (paragraphs.length >= 2) {
      const last = paragraphs[paragraphs.length - 1]
      const secondLast = paragraphs[paragraphs.length - 2]
      
      console.log('Checking:', secondLast.text, 'and', last.text)
      
      if (isTablePattern(secondLast.text, last.text)) {
        console.log('Creating table!')
        createTableFromParagraphs(view, secondLast, last)
      }
    }
  } catch (e) {
    console.error('Table creation error:', e)
  }
}

// 检测是否是表格头（单行包含多个列）
function isTableHeader(text) {
  // 必须包含 | 并且至少有2列
  const pipes = (text.match(/\|/g) || []).length
  const columns = text.split('|').map(s => s.trim()).filter(s => s).length
  
  console.log('Header check:', text, 'pipes:', pipes, 'columns:', columns)
  
  // 至少要有2个 | 符号（3列）或者1个 | 符号（2列）
  return pipes >= 1 && columns >= 2
}

function isTablePattern(headerLine, separatorLine) {
  const hasHeader = headerLine.includes('|')
  const isSeparator = /^[\s\-:|]+$/.test(separatorLine.replace(/\|/g, ''))
  console.log('Pattern check:', hasHeader, isSeparator, headerLine, separatorLine)
  return hasHeader && isSeparator && separatorLine.includes('-')
}

// 从表格头直接创建完整表格
function createTableFromHeader(view, headerText) {
  const { state } = view
  const { schema } = state
  
  // 解析表头
  const headers = headerText.split('|')
    .map(h => h.trim())
    .filter(h => h)
  
  console.log('Creating table with headers:', headers)
  
  if (headers.length === 0) return
  
  // 创建表格节点
  const headerCells = headers.map(header => 
    schema.nodes.tableHeader.create(
      null,
      schema.nodes.paragraph.create(null, schema.text(header))
    )
  )
  const headerRow = schema.nodes.tableRow.create(null, headerCells)
  
  // 创建一个空数据行
  const emptyCells = headers.map(() =>
    schema.nodes.tableCell.create(
      null,
      schema.nodes.paragraph.create()
    )
  )
  const emptyRow = schema.nodes.tableRow.create(null, emptyCells)
  
  const table = schema.nodes.table.create(null, [headerRow, emptyRow])
  
  // 替换当前段落
  const { tr } = state
  const { $from } = state.selection
  const startPos = $from.before($from.depth)
  const endPos = $from.after($from.depth)
  
  console.log('Replacing paragraph with table from', startPos, 'to', endPos)
  
  tr.replaceWith(startPos, endPos, table)
  
  // 将光标移动到第一个数据单元格
  const newPos = startPos + 1 + headerRow.nodeSize + 1 + 1 // table + headerRow + firstDataRow + firstCell
  tr.setSelection(state.selection.constructor.near(tr.doc.resolve(newPos)))
  
  view.dispatch(tr)
}

function createTableFromParagraphs(view, headerPara, separatorPara) {
  const { state } = view
  const { schema } = state
  
  // 解析表头
  const headers = headerPara.text.split('|')
    .map(h => h.trim())
    .filter(h => h)
  
  console.log('Headers:', headers)
  
  if (headers.length === 0) return
  
  // 创建表格节点
  const headerCells = headers.map(header => 
    schema.nodes.tableHeader.create(
      null,
      schema.nodes.paragraph.create(null, schema.text(header))
    )
  )
  const headerRow = schema.nodes.tableRow.create(null, headerCells)
  
  // 创建一个空数据行
  const emptyCells = headers.map(() =>
    schema.nodes.tableCell.create(
      null,
      schema.nodes.paragraph.create()
    )
  )
  const emptyRow = schema.nodes.tableRow.create(null, emptyCells)
  
  const table = schema.nodes.table.create(null, [headerRow, emptyRow])
  
  // 计算替换范围
  const startPos = headerPara.pos
  const endPos = separatorPara.pos + separatorPara.nodeSize
  
  console.log('Replacing from', startPos, 'to', endPos)
  
  // 执行替换
  const { tr } = state
  tr.replaceWith(startPos, endPos, table)
  view.dispatch(tr)
}

// 检查光标是否在表格内
function isInsideTable($pos) {
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'table') {
      return true;
    }
  }
  return false;
}

// 检查光标是否在表格头内
function isInTableHeader($pos) {
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'tableHeader') {
      return true;
    }
  }
  return false;
}

// 添加新的表格行
function addTableRow(view) {
  const { state } = view;
  const { $from } = state.selection;
  const { schema } = state;
  
  // 找到当前表格
  let tableDepth = -1;
  let tableRowDepth = -1;
  
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'table' && tableDepth === -1) {
      tableDepth = depth;
    }
    if (node.type.name === 'tableRow' && tableRowDepth === -1) {
      tableRowDepth = depth;
    }
  }
  
  if (tableDepth === -1 || tableRowDepth === -1) return;
  
  const table = $from.node(tableDepth);
  const currentRow = $from.node(tableRowDepth);
  
  // 计算列数
  let cellCount = 0;
  currentRow.forEach(child => {
    if (child.type.name === 'tableCell' || child.type.name === 'tableHeader') {
      cellCount++;
    }
  });
  
  // 创建新行
  const newCells = [];
  for (let i = 0; i < cellCount; i++) {
    newCells.push(
      schema.nodes.tableCell.create(
        null,
        schema.nodes.paragraph.create()
      )
    );
  }
  const newRow = schema.nodes.tableRow.create(null, newCells);
  
  // 插入新行
  const { tr } = state;
  const rowEndPos = $from.after(tableRowDepth);
  tr.insert(rowEndPos, newRow);
  
  // 将光标移动到新行的第一个单元格
  const newCellPos = rowEndPos + 1 + 1; // newRow + firstCell
  tr.setSelection(state.selection.constructor.near(tr.doc.resolve(newCellPos)));
  
  view.dispatch(tr);
}

// 删除当前行
function deleteCurrentRow(view) {
  const { state } = view;
  const { $from } = state.selection;
  
  // 找到当前行和表格
  let tableRowDepth = -1;
  let tableDepth = -1;
  
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'tableRow' && tableRowDepth === -1) {
      tableRowDepth = depth;
    }
    if (node.type.name === 'table' && tableDepth === -1) {
      tableDepth = depth;
    }
  }
  
  if (tableRowDepth === -1 || tableDepth === -1) {
    console.log('Not in a table row, cannot delete');
    return;
  }
  
  const table = $from.node(tableDepth);
  let rowCount = 0;
  table.forEach(child => {
    if (child.type.name === 'tableRow') {
      rowCount++;
    }
  });
  
  // 如果只有一行（通常是头部行），删除整个表格
  if (rowCount <= 1) {
    console.log('Only one row left, deleting entire table');
    deleteEntireTable(view);
    return;
  }
  
  console.log(`Deleting row, ${rowCount} rows in table`);
  
  // 删除行
  const { tr } = state;
  const rowStartPos = $from.before(tableRowDepth);
  const rowEndPos = $from.after(tableRowDepth);
  
  console.log(`Deleting row from ${rowStartPos} to ${rowEndPos}`);
  
  tr.delete(rowStartPos, rowEndPos);
  
  // 调整光标位置到相邻行
  try {
    // 尝试移动到删除位置的下一行，如果没有则移动到上一行
    let newPos = rowStartPos;
    if (newPos < tr.doc.content.size) {
      const $newPos = tr.doc.resolve(newPos);
      if ($newPos.parent.type.name === 'table') {
        // 在表格内找到第一个可编辑位置
        for (let i = newPos; i < tr.doc.content.size; i++) {
          const $pos = tr.doc.resolve(i);
          if ($pos.parent.type.name === 'paragraph' && $pos.parent.parent?.type.name === 'tableCell') {
            newPos = i;
            break;
          }
        }
      }
    } else {
      newPos = Math.max(0, tr.doc.content.size - 1);
    }
    
    tr.setSelection(state.selection.constructor.near(tr.doc.resolve(newPos)));
  } catch (e) {
    console.warn('Error positioning cursor after row deletion:', e);
  }
  
  view.dispatch(tr);
}

// 删除整个表格
function deleteEntireTable(view) {
  const { state } = view;
  const { $from } = state.selection;
  
  // 找到表格
  let tableDepth = -1;
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      tableDepth = depth;
      break;
    }
  }
  
  if (tableDepth === -1) return;
  
  // 删除整个表格
  const { tr } = state;
  const tableStartPos = $from.before(tableDepth);
  const tableEndPos = $from.after(tableDepth);
  tr.delete(tableStartPos, tableEndPos);
  
  // 在表格位置插入空段落
  const emptyParagraph = state.schema.nodes.paragraph.create();
  tr.insert(tableStartPos, emptyParagraph);
  
  // 将光标移动到新段落
  tr.setSelection(state.selection.constructor.near(tr.doc.resolve(tableStartPos + 1)));
  
  view.dispatch(tr);
}

export default SimpleTableExtension;