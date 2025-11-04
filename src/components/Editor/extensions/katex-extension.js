// src/extensions/katex-extension.js
import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';

export const KatexExtension = Node.create({
    name: 'katex',
    group: 'block',
    atom: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            formula: {
                default: '',
            },
            displayMode: {
                default: false,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-katex]',
                getAttrs: node => ({
                    formula: node.getAttribute('data-formula'),
                    displayMode: node.getAttribute('data-display-mode') === 'true',
                }),
            },
        ];
    },

    renderHTML({ node }) {
        try {
            const renderedKatex = katex.renderToString(node.attrs.formula, {
                displayMode: node.attrs.displayMode,
                throwOnError: false,
            });

            return ['div', mergeAttributes(
                this.options.HTMLAttributes,
                {
                    'data-katex': '',
                    'data-formula': node.attrs.formula,
                    'data-display-mode': String(node.attrs.displayMode),
                    class: node.attrs.displayMode ? 'katex-display' : 'katex-inline',
                }
            ), ['span', {
                class: 'katex-html',
                innerHTML: renderedKatex
            }]];
        } catch (error) {
            return ['div', mergeAttributes(
                this.options.HTMLAttributes,
                {
                    'data-katex': '',
                    'data-formula': node.attrs.formula,
                    'data-display-mode': String(node.attrs.displayMode),
                    class: 'katex-error',
                }
            ), `Error: ${error.message}`];
        }
    },

    addCommands() {
        return {
            setKatex: attributes => ({ chain }) => {
                return chain()
                    .insertContent({
                        type: this.name,
                        attrs: attributes,
                    })
                    .run();
            },
        };
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            const dom = document.createElement('div');
            dom.setAttribute('data-katex', '');
            dom.setAttribute('data-formula', node.attrs.formula);
            dom.setAttribute('data-display-mode', String(node.attrs.displayMode));
            dom.className = node.attrs.displayMode ? 'katex-display' : 'katex-inline';

            try {
                const renderedKatex = katex.renderToString(node.attrs.formula, {
                    displayMode: node.attrs.displayMode,
                    throwOnError: false,
                });

                const span = document.createElement('span');
                span.className = 'katex-html';
                span.innerHTML = renderedKatex;
                dom.appendChild(span);
            } catch (error) {
                dom.textContent = `Error: ${error.message}`;
                dom.className = 'katex-error';
            }

            return {
                dom,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'katex') return false;

                    if (updatedNode.attrs.formula !== node.attrs.formula ||
                        updatedNode.attrs.displayMode !== node.attrs.displayMode) {
                        dom.setAttribute('data-formula', updatedNode.attrs.formula);
                        dom.setAttribute('data-display-mode', String(updatedNode.attrs.displayMode));
                        dom.className = updatedNode.attrs.displayMode ? 'katex-display' : 'katex-inline';

                        try {
                            const renderedKatex = katex.renderToString(updatedNode.attrs.formula, {
                                displayMode: updatedNode.attrs.displayMode,
                                throwOnError: false,
                            });

                            const span = dom.querySelector('.katex-html') || document.createElement('span');
                            span.className = 'katex-html';
                            span.innerHTML = renderedKatex;

                            if (!dom.contains(span)) {
                                dom.innerHTML = '';
                                dom.appendChild(span);
                            }
                        } catch (error) {
                            dom.innerHTML = '';
                            dom.textContent = `Error: ${error.message}`;
                            dom.className = 'katex-error';
                        }
                    }

                    return true;
                },
            };
        };
    },
});

export default KatexExtension;