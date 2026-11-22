// How a single newline inside a paragraph is shown on the site.
//
// Obsidian (with "strict line breaks" off) shows it as a new line; standard Markdown would join the
// lines. In Chinese writing each line is effectively a paragraph, so in body text and quotes every
// line becomes its own <p> (spaced like paragraphs). Inside list items and tables a newline stays a
// plain <br>, so lists keep their compact rhythm. Code spans and code blocks are separate node
// types and are never touched.

// Visitor nodes are views over the native tree; copy one into a plain object we can re-insert.
const plain = node => JSON.parse(JSON.stringify(node));

export const obsidianParagraphs = {
	name: 'obsidian-paragraphs',
	paragraph(node, ctx) {
		const parent = ctx.parent(node);
		if (!parent || !['root', 'blockquote'].includes(parent.type)) return;
		if (!node.children.some(c => c.type === 'text' && c.value.includes('\n'))) return;
		const groups = [[]];
		for (const child of node.children) {
			if (child.type !== 'text' || !child.value.includes('\n')) { groups.at(-1).push(plain(child)); continue; }
			child.value.split('\n').forEach((part, i) => {
				if (i) groups.push([]);
				if (part) groups.at(-1).push({ type: 'text', value: part });
			});
		}
		ctx.replaceNode(node, groups.filter(g => g.length).map(children => ({ type: 'paragraph', children })));
	},
};

export const obsidianLineBreaks = {
	name: 'obsidian-line-breaks',
	text(node, ctx) {
		if (!node.value.includes('\n')) return;
		const nodes = [];
		node.value.split('\n').forEach((part, i) => {
			if (i) nodes.push({ type: 'break' });
			if (part) nodes.push({ type: 'text', value: part });
		});
		ctx.replaceNode(node, nodes);
	},
};
