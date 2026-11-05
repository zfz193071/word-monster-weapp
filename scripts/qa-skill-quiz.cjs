// Operates the real listening cards; no component state or storage injection.
async function answerSkillQuiz(scene, correct=true, advance=true) {
  const state=await scene.data();const request=state.skillQuiz;
  if(!request)return false;
  const choice=await scene.$('.skill-quiz');if(!choice)return true;
  const {view}=await choice.data();if(!view||view.paused)return true;
  if(view.phase==='answered') return true; // Feedback automatically opens the skill cards.
  if(!view.canChoose)return true;
  const target=request.plan.waves[request.waveIndex].targetWordId;
  for(const card of await choice.$$('.choice')){
    const id=await card.attribute('data-word-id');
    if((id===target)===correct){await card.tap();break;}
  }
  return true;
}
module.exports={answerSkillQuiz};
