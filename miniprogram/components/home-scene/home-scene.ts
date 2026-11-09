import type { StrengthTarget } from '../../services/strength-guide';
import type { PetAppearance } from '../../pets/catalog';
import { RoomOrbit } from '../../home/room-orbit';
import { HomeRoomScene } from '../../home/room-scene';
interface State { coverTimer?: ReturnType<typeof setTimeout>; orbit: RoomOrbit; width: number; left: number; top: number; tap?: { id:number; x:number; y:number; moved:boolean }; scene?: HomeRoomScene; visible: boolean; alive: boolean; epoch: number; covered: boolean; captureId: number }
const states=new WeakMap<object,State>();
Component({
  properties:{houseLevel:{type:Number,value:1,observer(){states.get(this)?.scene?.setHouseLevel(this.properties.houseLevel);}}, guide:{type:String,value:'',observer(){this.updateGuide();}},pet:{type:Object,value:null,observer(){states.get(this)?.scene?.setPet(this.properties.pet as PetAppearance|null);}},weaponLevel:{type:Number,value:1,observer(){const state=states.get(this);state?.scene?.setWeaponLevel(this.properties.weaponLevel);}},paused:{type:Boolean,value:false,observer(){this.synchronize();}},covered:{type:Boolean,value:false,observer(){this.synchronize();}} },
  data:{error:false,canvasCovered:false,frozenFrames:[] as {id:number;src:string}[]},
  lifetimes:{
    attached(){states.set(this,{orbit:new RoomOrbit(),width:0,left:0,top:0,visible:true,alive:true,epoch:0,covered:false,captureId:0});},
    ready(){this.mount();},
    detached(){const state=states.get(this);if(state){if(state.coverTimer!==undefined)clearTimeout(state.coverTimer);state.tap=undefined;state.orbit.cancel();state.alive=false;state.epoch++;state.scene?.dispose();}states.delete(this);},
  },
  pageLifetimes:{
    show(){const state=states.get(this);if(state){state.visible=true;this.synchronize();}},
    hide(){const state=states.get(this);if(state){state.visible=false;this.synchronize();}},
    resize(){this.mount();},
  },
  methods:{
    updateGuide(){
      const state=states.get(this);if(!state?.scene)return;
      const guide=this.properties.guide as StrengthTarget;
      if(guide){state.tap=undefined;state.orbit=new RoomOrbit();state.scene.setYaw(0);}
      state.scene.setGuide(guide);
    },
    mount(){
      const state=states.get(this);if(!state?.alive)return;state.tap=undefined;state.orbit.cancel();const epoch=++state.epoch;
      if(state.coverTimer!==undefined)clearTimeout(state.coverTimer);state.scene?.dispose();state.scene=undefined;state.covered=false;
      this.createSelectorQuery().select('#room-canvas').fields({node:true,size:true,rect:true},result=>{
        if(!state.alive||epoch!==state.epoch)return;
        try{
          if(!result?.node||!result.width||!result.height)throw new Error('场景节点尚未就绪');
          state.width=result.width;state.left=result.left??0;state.top=result.top??0;
          state.scene=new HomeRoomScene(result.node,result.width,result.height,wx.getWindowInfo().pixelRatio,state.orbit.yaw);
          state.scene.setHouseLevel(this.properties.houseLevel);
          state.scene.setWeaponLevel(this.properties.weaponLevel);
          state.scene.setPet(this.properties.pet as PetAppearance|null);
          this.updateGuide();
          this.setData({error:false});this.synchronize();
        }catch{this.setData({error:true});if(this.properties.covered)this.finishCover(++state.captureId);}
      }).exec();
    },
    synchronize(){
      const state=states.get(this);if(!state?.alive)return;
      if(this.properties.covered||this.properties.paused||!state.visible){state.tap=undefined;state.orbit.cancel();}
      if(!state.scene){wx.nextTick(()=>{if(state.alive&&!state.scene)this.mount();});return;}
      const restore=()=>{
        if(!state.alive)return;
        state.scene?.setActive(state.visible&&!this.properties.paused&&!this.properties.covered,()=>{
          if(state.alive&&!this.properties.covered&&this.data.frozenFrames.length)this.setData({frozenFrames:[]});
        });
      };
      if(this.properties.covered&&!state.covered){
        state.scene.setActive(false);
        const src=state.scene.capture();
        const id=++state.captureId;
        if(state.coverTimer!==undefined)clearTimeout(state.coverTimer);
        state.coverTimer=setTimeout(()=>this.finishCover(id),1500);
        if(src)this.setData({frozenFrames:[{id,src}]});
        else this.finishCover(id);
      }
      state.covered=this.properties.covered;
      if(!state.covered){if(state.coverTimer!==undefined)clearTimeout(state.coverTimer);state.coverTimer=undefined;}
      // Retain both the native drawing buffer and its last snapshot. Hide the
      // native layer only after the image has loaded; reopening needs no mount.
      if(!state.covered&&this.data.canvasCovered){this.triggerEvent('coverchange',{ready:false});this.setData({canvasCovered:false},restore);}
      else restore();
    },
    frozenReady(event:WechatMiniprogram.BaseEvent){
      const state=states.get(this);
      if(state?.alive&&this.properties.covered&&Number(event.currentTarget.dataset.captureId)===state.captureId){
        this.finishCover(state.captureId);
      }
    },
    finishCover(captureId:number){
      const state=states.get(this);
      if(!state?.alive||!this.properties.covered||state.captureId!==captureId)return;
      if(state.coverTimer!==undefined)clearTimeout(state.coverTimer);state.coverTimer=undefined;
      this.setData({canvasCovered:true},()=>{
        if(state.alive&&this.properties.covered&&state.captureId===captureId)this.triggerEvent('coverchange',{ready:true});
      });
    },
    touchStart(event:WechatMiniprogram.TouchEvent){
      const state=states.get(this);
      if(!state?.scene||!state.visible||this.properties.paused||this.properties.covered)return;
      if(!state.tap&&event.touches.length){const touch=event.touches[0];state.tap={id:touch.identifier,x:touch.clientX,y:touch.clientY,moved:false};}
      state.orbit.start(event.touches);
    },
    touchMove(event:WechatMiniprogram.TouchEvent){
      const state=states.get(this);
      if(!state?.scene||!state.visible||this.properties.paused||this.properties.covered)return;
      const touch=event.touches.find(item=>item.identifier===state.tap?.id);
      if(touch&&state.tap&&Math.hypot(touch.clientX-state.tap.x,touch.clientY-state.tap.y)>=6)state.tap.moved=true;
      if(state.orbit.move(event.touches,state.width))state.scene.setYaw(state.orbit.yaw);
    },
    touchEnd(event:WechatMiniprogram.TouchEvent){
      const state=states.get(this);if(!state)return;
      const tap=state.tap;const touch=event.changedTouches.find(item=>item.identifier===tap?.id);
      state.orbit.end(event.changedTouches);
      if(!tap||!touch)return;state.tap=undefined;
      if(!tap.moved&&Math.hypot(touch.clientX-tap.x,touch.clientY-tap.y)<6&&state.visible&&!this.properties.paused&&!this.properties.covered
        &&state.scene){
        const x=touch.clientX-state.left,y=touch.clientY-state.top;
        if(state.scene.hitPet(x,y))this.triggerEvent('pettap');
        else if(state.scene.hitHero(x,y))this.triggerEvent('herotap');
        else if(state.scene.hitHouse(x,y))this.triggerEvent('housetap');
      }
    },
    touchCancel(){const state=states.get(this);if(state){state.tap=undefined;state.orbit.cancel();}},
    stopTap(){},
    retry(){this.mount();},
  },
});
