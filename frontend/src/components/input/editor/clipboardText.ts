import {Extension} from '@tiptap/core'
import {Plugin, PluginKey} from '@tiptap/pm/state'
import type {Fragment, Node as PMNode, Slice} from '@tiptap/pm/model'

function leafText(leaf: PMNode): string {
	if (leaf.type.name === 'hardBreak') {
		return '\n'
	}
	const fromSpec = leaf.type.spec.leafText
	return typeof fromSpec === 'function' ? fromSpec(leaf) : ''
}

function inlineText(node: PMNode | Fragment): string {
	return node.textBetween(0, 'nodeSize' in node ? node.content.size : node.size, '\n', leafText)
}

function prefixLines(text: string, first: string, rest: string): string {
	return text
		.split('\n')
		.map((line, i) => (i === 0 ? first : (line === '' ? '' : rest)) + line)
		.join('\n')
}

function serializeListItems(list: PMNode): string {
	const ordered = list.type.name === 'orderedList'
	let number = Number(list.attrs.start ?? 1) || 1

	const items: string[] = []
	list.forEach(item => {
		let marker = '- '
		if (ordered) {
			marker = `${number}. `
			number++
		} else if (item.type.name === 'taskItem') {
			marker = item.attrs.checked ? '- [x] ' : '- [ ] '
		}
		const content = serializeBlocks(item.content, '\n')
		items.push(prefixLines(content, marker, ' '.repeat(marker.length)))
	})
	return items.join('\n')
}

function serializeBlock(node: PMNode): string {
	if (node.isTextblock) {
		return inlineText(node)
	}

	switch (node.type.name) {
		case 'bulletList':
		case 'orderedList':
		case 'taskList':
			return serializeListItems(node)
		case 'blockquote':
			return prefixLines(serializeBlocks(node.content, '\n\n'), '> ', '> ')
		case 'horizontalRule':
			return '---'
		case 'tableRow':
			return serializeBlocks(node.content, '\t')
		case 'table':
			return serializeBlocks(node.content, '\n')
		case 'tableCell':
		case 'tableHeader':
			return serializeBlocks(node.content, ' ')
	}

	if (node.isLeaf) {
		return leafText(node)
	}

	return serializeBlocks(node.content, '\n\n')
}

function serializeBlocks(fragment: Fragment, separator: string): string {
	let hasInline = false
	fragment.forEach(child => {
		if (child.isInline) {
			hasInline = true
		}
	})
	if (hasInline) {
		return inlineText(fragment)
	}

	const parts: string[] = []
	fragment.forEach(child => {
		parts.push(serializeBlock(child))
	})
	return parts.join(separator)
}

/**
 * Serializes copied content to plain text, keeping the markers of (bullet,
 * ordered and task) lists so the structure survives pasting as plain text.
 */
export function serializeSliceAsText(slice: Slice): string {
	return serializeBlocks(slice.content, '\n\n')
}

export const ClipboardTextWithListMarkers = Extension.create({
	name: 'clipboardTextWithListMarkers',

	// Run before tiptap's core clipboard text serializer, which drops list markers.
	priority: 1000,

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey('clipboardTextWithListMarkers'),
				props: {
					clipboardTextSerializer: slice => serializeSliceAsText(slice),
				},
			}),
		]
	},
})
