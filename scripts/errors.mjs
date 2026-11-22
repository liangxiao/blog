// Errors carry a machine-readable code so the Obsidian plugin can offer the right next step.
export class BlogError extends Error {
 constructor(message, code, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}
export const codes = {
 AUTH_CLOUDFLARE: 'AUTH_CLOUDFLARE', // wrangler token expired or missing
 NETWORK: 'NETWORK',                 // timeouts, DNS, proxy, connection reset
 REMOTE_CHANGED: 'REMOTE_CHANGED',   // GitHub or repo has changes that must be synced first
 REPO_STATE: 'REPO_STATE',           // dirty working tree, wrong branch, unpushed commits
 VALIDATION: 'VALIDATION',           // article or site content needs fixing
 BUILD: 'BUILD',                     // astro build failed
 IMAGE: 'IMAGE',                     // image host misconfigured or image missing after upload
 DEPLOY: 'DEPLOY',                   // Cloudflare Pages deploy failed
 CANCELLED: 'CANCELLED',             // user cancelled at a safe checkpoint
};
const networkPattern = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed|aborted due to timeout|socket hang up|network/i;
export const isNetworkError = error => error?.name === 'TimeoutError' || error?.name === 'AbortError' || networkPattern.test(`${error?.message} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`);
// Best-effort classification for errors thrown before they were wrapped.
export function classify(error) {
 if (error?.code && codes[error.code]) return error.code;
 const text = String(error?.message || error);
 if (/Cloudflare 授权|media:login|cloudflare:login|Not logged in|auth token|Authentication error|\b10000\b/i.test(text)) return codes.AUTH_CLOUDFLARE;
 if (/外部修改|远程有新提交|同步变化|同步博客仓库/.test(text)) return codes.REMOTE_CHANGED;
 if (/未提交的修改|main 分支|未推送|合并到 main/.test(text)) return codes.REPO_STATE;
 if (isNetworkError(error) || /超时|连接 GitHub|网络/.test(text)) return codes.NETWORK;
 if (/请填写|slug|双链|图片不存在|引用式图片|文章属性/.test(text)) return codes.VALIDATION;
 return null;
}
