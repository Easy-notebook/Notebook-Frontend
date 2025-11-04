import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import useStore from '../../../store/notebookStore'
import { handleFileUpload } from '../../../utils/fileUtils'
import { notebookApiIntegration } from '../../../services/notebookServices'
import { Backend_BASE_URL } from '../../../config/base_url'
import { generateCellId } from '../utils/cellConverters'

const key = new PluginKey('uploadDropPaste')

export const UploadDropExtension = Extension.create({
  name: 'uploadDropPaste',

  addProseMirrorPlugins() {
    const self = this
    return [
      new Plugin({
        key,
        props: {
          handleDOMEvents: {
            drop(view, event: Event) {
              const e = event as DragEvent
              const editor = (self.editor as any)
              const state = useStore.getState()
              const { notebookId } = state
              if (!notebookId) return false
              if (!e.dataTransfer) return false

              const files = Array.from(e.dataTransfer.files || []) as File[]
              if (!files.length) return false

              e.preventDefault()
              e.stopPropagation()

              const uploadConfig: any = {
                mode: 'restricted',
                maxFileSize: 50 * 1024 * 1024,
                maxFiles: files.length,
                allowedTypes: [
                  '.txt', '.md', '.json', '.js', '.py', '.html', '.css', '.csv', '.pdf', '.zip', '.tar', '.gz',
                  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
                  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
                  '.mp4', '.webm', '.mov', '.avi', '.mkv'
                ],
                targetDir: '.assets'
              }

              // minimal no-op UI hooks
              const setUploading = (_: boolean) => {}
              const setUploadProgress = (_: number) => {}
              const setError = (_: string | null) => {}
              const fileInputRef = { current: null as any }
              const abortControllerRef = { current: null as any }
              const toast = ({ title, description, variant }: any) => {
                console.log(`${variant || 'info'}: ${title} - ${description}`)
              }

              handleFileUpload({
                notebookId,
                files,
                notebookApiIntegration,
                uploadConfig,
                setUploading,
                setUploadProgress,
                setError,
                fileInputRef: fileInputRef as any,
                setIsPreview: () => {},
                toast,
                onUpdate: (_cellId: string, { uploadedFiles }: { uploadedFiles: string[] }) => {
                  const uploaded = uploadedFiles || []
                  uploaded.forEach((name) => {
                    const lower = name.toLowerCase()
                    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => lower.endsWith(ext))
                    const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`
                    if (isImage) {
                      // Generate a unique cell ID for the image
                      const newCellId = generateCellId()
                      const markdownContent = `![${name}](${url})`
                      
                      // Create a proper image cell in the store first
                      const { setCells, cells } = useStore.getState()
                      const newImageCell = {
                        id: newCellId,
                        type: 'image' as const,
                        content: markdownContent,
                        outputs: [],
                        enableEdit: true,
                        metadata: {}
                      }
                      setCells([...cells, newImageCell])
                      
                      try {
                        // Insert the image with proper cellId
                        editor.chain().focus().insertContent(
                          `<div data-type="markdown-image" data-cell-id="${newCellId}" data-src="${url}" data-alt="${name}" data-title="${name}" data-markdown="${markdownContent}"></div>`
                        ).run()
                      } catch {
                        editor.chain().focus().insertContent(`<img src="${url}" alt="${name}" title="${name}" />`).run()
                      }
                    } else {
                      const newCellId = generateCellId()
                      const markdown = `[${name}](${url})`
                      
                      // Create a proper link cell in the store first
                      const { setCells, cells } = useStore.getState()
                      const newLinkCell = {
                        id: newCellId,
                        type: 'link' as const,
                        content: markdown,
                        outputs: [],
                        enableEdit: true,
                      }
                      setCells([...cells, newLinkCell])
                      
                      editor.chain().focus().insertContent(
                        `<div data-type="file-attachment" data-cell-id="${newCellId}" data-markdown="${markdown}"></div>`
                      ).run()
                    }
                  })
                },
                cellId: '',
                abortControllerRef: abortControllerRef as any,
                fetchFileList: async () => { try { await notebookApiIntegration.listFiles(notebookId) } catch {} },
              }).catch(err => {
                console.error('Upload failed (drop):', err)
              })

              return true
            },
            paste(view, event: Event) {
              const e = event as ClipboardEvent
              const editor = (self.editor as any)
              const state = useStore.getState()
              const { notebookId } = state
              if (!notebookId || !e.clipboardData) return false

              const files = Array.from(e.clipboardData.files || []) as File[]
              if (!files.length) return false

              e.preventDefault()
              e.stopPropagation()

              const uploadConfig: any = {
                mode: 'restricted',
                maxFileSize: 50 * 1024 * 1024,
                maxFiles: files.length,
                allowedTypes: [
                  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
                  '.txt', '.md', '.json', '.csv', '.pdf'
                ],
                targetDir: '.assets'
              }

              const setUploading = (_: boolean) => {}
              const setUploadProgress = (_: number) => {}
              const setError = (_: string | null) => {}
              const fileInputRef = { current: null as any }
              const abortControllerRef = { current: null as any }
              const toast = ({ title, description, variant }: any) => {
                console.log(`${variant || 'info'}: ${title} - ${description}`)
              }

              handleFileUpload({
                notebookId,
                files,
                notebookApiIntegration,
                uploadConfig,
                setUploading,
                setUploadProgress,
                setError,
                fileInputRef: fileInputRef as any,
                setIsPreview: () => {},
                toast,
                onUpdate: (_cellId: string, { uploadedFiles }: { uploadedFiles: string[] }) => {
                  const uploaded = uploadedFiles || []
                  uploaded.forEach((name) => {
                    const lower = name.toLowerCase()
                    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => lower.endsWith(ext))
                    const url = `${Backend_BASE_URL}/assets/${encodeURIComponent(notebookId)}/${encodeURIComponent(name)}`
                    if (isImage) {
                      // Generate a unique cell ID for the image
                      const newCellId = generateCellId()
                      const markdownContent = `![${name}](${url})`
                      
                      // Create a proper image cell in the store first
                      const { setCells, cells } = useStore.getState()
                      const newImageCell = {
                        id: newCellId,
                        type: 'image' as const,
                        content: markdownContent,
                        outputs: [],
                        enableEdit: true,
                        metadata: {}
                      }
                      setCells([...cells, newImageCell])
                      
                      try {
                        // Insert the image with proper cellId
                        editor.chain().focus().insertContent(
                          `<div data-type="markdown-image" data-cell-id="${newCellId}" data-src="${url}" data-alt="${name}" data-title="${name}" data-markdown="${markdownContent}"></div>`
                        ).run()
                      } catch {
                        editor.chain().focus().insertContent(`<img src="${url}" alt="${name}" title="${name}" />`).run()
                      }
                    } else {
                      const newCellId = generateCellId()
                      const markdown = `[${name}](${url})`
                      
                      // Create a proper link cell in the store first
                      const { setCells, cells } = useStore.getState()
                      const newLinkCell = {
                        id: newCellId,
                        type: 'link' as const,
                        content: markdown,
                        outputs: [],
                        enableEdit: true,
                      }
                      setCells([...cells, newLinkCell])
                      
                      editor.chain().focus().insertContent(
                        `<div data-type="file-attachment" data-cell-id="${newCellId}" data-markdown="${markdown}"></div>`
                      ).run()
                    }
                  })
                },
                cellId: '',
                abortControllerRef: abortControllerRef as any,
                fetchFileList: async () => { try { await notebookApiIntegration.listFiles(notebookId) } catch {} },
              }).catch(err => {
                console.error('Upload failed (paste):', err)
              })

              return true
            },
          },
        },
      })
    ]
  },
})
