// src/extensions/mermaid-extension.js
import { Node, mergeAttributes } from '@tiptap/core';
import mermaid from 'mermaid';

export const MermaidExtension = Node.create({
    name: 'mermaid',
    group: 'block',
    content: 'text*',

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div.mermaid',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(
            this.options.HTMLAttributes,
            HTMLAttributes,
            { class: 'mermaid' }
        ), 0];
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            const dom = document.createElement('div');
            dom.className = 'mermaid';
            dom.textContent = node.textContent;

            const renderMermaid = () => {
                try {
                    const id = `mermaid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    mermaid.initialize({ startOnLoad: true });
                    mermaid.render(id, node.textContent, (svgCode) => {
                        dom.innerHTML = svgCode;
                    });
                } catch (error) {
                    console.error('Mermaid rendering error:', error);
                    dom.innerHTML = `<div class="mermaid-error">Diagram Error: ${error.message}</div>`;
                }
            };

            // Render after a small delay to ensure the DOM is ready
            setTimeout(renderMermaid, 0);

            return {
                dom,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'mermaid') return false;

                    if (updatedNode.textContent !== node.textContent) {
                        dom.textContent = updatedNode.textContent;
                        setTimeout(renderMermaid, 0);
                    }

                    return true;
                },
            };
        };
    },

    addCommands() {
        return {
            insertMermaid: () => ({ chain }) => {
                return chain()
                    .insertContent({
                        type: this.name,
                        content: [
                            {
                                type: 'text',
                                text: 'graph TD;\nA-->B;'
                            }
                        ]
                    })
                    .run();
            },
        };
    },
});

export default MermaidExtension;