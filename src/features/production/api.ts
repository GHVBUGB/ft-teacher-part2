export class LiveApiError extends Error {
  constructor(public status: number, public code: string) { super(messages[code] || `请求未完成（${code}）`); }
}
const messages: Record<string,string> = {
 LOGIN_REQUIRED:'请重新登录。', INVALID_CREDENTIALS:'邮箱或密码不正确，或账号尚未启用。',
 EMAIL_NOT_CONFIGURED:'邮箱发信服务尚未配置，请使用已分配的测试账号。', INVALID_OR_EXPIRED_CODE:'验证码错误、过期或已使用。',
 RATE_LIMITED:'尝试次数较多，请稍后再试。', WAIT_BEFORE_RESEND:'请等候60秒再获取验证码。', PREVIOUS_STAGE_REQUIRED:'请先完成上一关。',
 PROVIDER_TRIAL_NOT_CONFIRMED:'语音评测有效期尚未确认，请联系培训负责人。', PROVIDER_BUSY:'正在处理其他老师的录音，请稍后重试。',
 ASSESSMENT_PENDING_RECONCILIATION:'上一段录音结果尚待核实，已阻止重复评测，请联系培训负责人。',
 SERVICE_UNAVAILABLE:'服务暂不可用，提交结果未确认，请保留页面并重试。', DATABASE_NOT_CONFIGURED:'数据库尚未配置。',
};
export async function liveApi<T>(path: string, body?: unknown): Promise<T> {
 const response = await fetch(`/api/v1${path}`,{method:body===undefined?'GET':'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(75000)});
 const value=await response.json();
 if (!response.ok) throw new LiveApiError(response.status,value.error?.code || `HTTP_${response.status}`);
 return value.data as T;
}
export type Stage='word'|'sentence'|'grammar';
export type Teacher={id:string;email:string;external_id:string|null;is_test_account:boolean};
export type Enrollment={id:string;content_version:string;completed_at:string|null};
export type ReadingItem={id:string;text:string;position:number;best_score:number|string|null;wrong_count:number};
export type Round={id:string;stage:Stage;status:'in_progress'|'passed'|'failed';items?:ReadingItem[];total?:number;question?:{id:string;prompt:string;option_a:string;option_b:string}|null;answers?:{question_id:string;correct:boolean}[]};
