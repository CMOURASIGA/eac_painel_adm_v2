import type {DashboardSummaryRow,DashboardOrder,StockRow,Replenishment} from '../types/api';
async function call(action:string,args:Record<string,unknown>={},mutate=false){
 const path='/api/eac-store/gateway';
 const response=await fetch(mutate?path:path+'?'+new URLSearchParams(Object.entries({action,...args}).map(([k,v])=>[k,String(v)])),mutate?{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...args})}:{credentials:'same-origin'});
 const json=await response.json();
 if(!response.ok||!json.success)throw new Error(json.error||'STORE_REQUEST_FAILED');
 return json.data;
}
export async function getSession(){const r=await fetch('/api/eac-store/gateway?action=stock',{credentials:'same-origin'});return r.ok?{access_token:'eac-session'}:null}
export async function signIn(){throw new Error('Use o login do EAC para acessar a loja.')}
export async function signOut(){return}
export async function fetchDashboardSummary(encontroId:string):Promise<DashboardSummaryRow[]>{return call('summary',{encontroId})}
export async function fetchOrders(encontroId:string):Promise<DashboardOrder[]>{return call('orders',{encontroId})}
export async function fetchStock():Promise<StockRow[]>{return call('stock')}
export async function fetchReplenishments(encontroId:string):Promise<Replenishment[]>{return call('replenishments',{encontroId})}
export async function getProofSignedUrl(path:string){const data=await call('proof',{path});return data?.signedUrl}
export async function createReplenishment(encontroId:string,items:Array<{cor:string;tamanho:string;quantidade:number}>){return call('createReplenishment',{encontroId,items},true)}
export async function receiveReplenishment(id:string,quantity:number){return call('receiveReplenishment',{id,quantity},true)}
export async function deliverItem(id:string,quantity:number){return call('deliverItem',{id,quantity},true)}
export async function updateOrderStatus(id:string,status:'ABERTA'|'CONCLUIDA'|'CANCELADA'){return call('updateOrderStatus',{id,status},true)}
export async function registerStockReceipt(cor:string,tamanho:string,quantity:number,note:string){return call('registerStockReceipt',{cor,tamanho,quantity,note},true)}
export async function setStockBalance(id:string,quantity:number,note:string){return call('setStockBalance',{id,quantity,note},true)}
export async function deleteStockBalance(id:string,note:string){return call('deleteStockBalance',{id,note},true)}
export async function resendConfirmationEmail(id:string){return call('resendEmail',{id},true)}
