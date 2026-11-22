// Obsidian (with the default "strict line breaks" off) shows a single newline inside a paragraph
// as a line break. Standard Markdown joins those lines into one, which made posts on the site read
// differently from the note. This Sätteri mdast plugin turns soft line breaks into <br>.
// Code spans and code blocks are separate node types, so they are left untouched.
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
