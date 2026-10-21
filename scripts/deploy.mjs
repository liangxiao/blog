import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function readDeployConfig(base=root){
 const file=path.join(base,'.blog-deploy.json');if(!fs.existsSync(file))return null;
 const config=JSON.parse(fs.readFileSync(file,'utf8'));if(config.enabled===false)return null;
 if(config.enabled!==true||!/^[a-f0-9]{32}$/.test(config.accountId||'')||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(config.project||'')||config.branch!=='main')throw new Error('请检查本机 .blog-deploy.json 的账户、项目名和 main 分支配置。');
 return config;
}
export function deployPages({base=root,config=readDeployConfig(base),invoke}={}){
 if(!config){console.log('已保存到 GitHub；未配置直接部署，请检查 Cloudflare 的自动部署状态。');return false;}
 const call=invoke||((args)=>spawnSync(process.execPath,[path.join(base,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:base,stdio:'inherit',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:config.accountId,WRANGLER_SEND_METRICS:'false'}}));
 console.log(`开始部署 Cloudflare Pages：${config.project}`);
 const result=call(['pages','deploy','dist','--project-name',config.project,'--branch',config.branch]);
 if(result.error||result.status!==0)throw new Error('GitHub 内容已保留，但 Cloudflare 部署未完成。请检查授权或网络后，再次点击发布即可重试；需要 Pages 权限时运行 npm run cloudflare:login。');
 console.log(`Cloudflare 已接受 ${config.project} 的部署。`);return true;
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const status=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});if(status.status!==0||status.stdout.trim())throw new Error('请先提交仓库改动，再部署。');
  const config=readDeployConfig();if(!config)throw new Error('请先填写本机 .blog-deploy.json。');
  const build=spawnSync('npm',['run','build'],{cwd:root,stdio:'inherit'});if(build.status!==0)throw new Error('构建失败，尚未部署。');
  deployPages({config});
 }catch(error){console.error(error.message);process.exitCode=1;}
}
