import { constantTimeEqual } from '../../../../server/crypto';
import { HttpError, jsonResponse, methodNotAllowedResponse, requireDatabase, requireSecret, responseFromError } from '../../../../server/http';
import { advanceEditorialSync } from '../../../../server/mercado-libre-editorial-sync';
import { readEditorialRunId } from '../../../../server/mercado-libre-editorial-store';
import type { PagesFunction } from '../../../../server/platform';
import { readJsonBody } from '../../../../server/validation';

export const onRequest: PagesFunction = async ({request,env}) => {
  if(request.method!=='POST')return methodNotAllowedResponse(['POST']);
  try{
    const secret=requireSecret(env.MERCADO_LIBRE_EDITORIAL_SCHEDULER_SECRET,'ML_EDITORIAL_SCHEDULER_MISSING','La programación editorial no está configurada.');
    if(!constantTimeEqual(request.headers.get('authorization')??'',`Bearer ${secret}`))throw new HttpError(401,'SCHEDULER_UNAUTHORIZED','Autenticación inválida.');
    const body=await readJsonBody(request,1024);
    return jsonResponse(await advanceEditorialSync(requireDatabase(env),env,'scheduler:editorial-github',readEditorialRunId(body)));
  }catch(error:unknown){return responseFromError(error);}
};
