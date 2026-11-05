import type { SessionPlan } from '../../miniprogram/fortress/types';
import type { ListeningResult } from '../../miniprogram/fortress/listening';
import { getLevel } from '../../miniprogram/fortress/levels';
export function skillQuizAnswer(quiz: {plan:SessionPlan;waveIndex:number;generation:number}, correct=false): ListeningResult {
  const wave=quiz.plan.waves[quiz.waveIndex];
  const selectedWordId=correct?wave.targetWordId:getLevel(quiz.plan.levelId).words.find(word=>word.id!==wave.targetWordId)!.id;
  return {context:{sessionId:quiz.plan.sessionId,waveId:wave.waveId,generation:quiz.generation},attempts:[{
    sessionId:quiz.plan.sessionId,waveId:wave.waveId,taskKind:'listeningChoice',targetWordId:wave.targetWordId,selectedWordId,correct,
    hintUsed:false,attemptIndex:1,replayCount:0,
  }]};
}
