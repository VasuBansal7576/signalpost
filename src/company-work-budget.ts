/** Local queue residence does not spend a company's active work allowance. */
export function companyStageDeadline(activeMs:number,allowanceMs:number,batchDeadline:number,at=Date.now()){
 const remaining=allowanceMs-activeMs;if(!Number.isFinite(remaining)||remaining<=0)throw Error('Company active work budget exhausted');return Math.min(batchDeadline,at+remaining);
}
