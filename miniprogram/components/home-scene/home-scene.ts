import { RoomOrbit } from '../../home/room-orbit';
import { HomeRoomScene } from '../../home/room-scene';
interface State { orbit: RoomOrbit; width: number; left: number; top: number; tap?: { id:number; x:number; y:number; moved:boolean }; scene?: HomeRoomScene; visible: boolean; alive: boolean; epoch: number }
const states=new WeakMap<object,State>();
Component({
  properties:{ weaponLevel:{type:Number,value:1,observer(){const state=states.get(this);state?.scene?.setWeaponLevel(this.properties.weaponLevel);}},paused:{type:Boolean,value:false,observer(){this.synchronize();}},covered:{type:Boolean,value:false,observer(){this.synchronize();}} },
  data:{frozenFrame:'',error:false},
  lifetimes:{
    attached(){states.set(this,{orbit:new RoomOrbit(),width:0,left:0,top:0,visible:true,alive:true,epoch:0});},
    ready(){this.mount();},
    detached(){const state=states.get(this);if(state){state.tap=undefined;state.orbit.cancel();state.alive=false;state.epoch++;state.scene?.dispose();}states.delete(this);},
  },
  pageLifetimes:{
    show(){const state=states.get(this);if(state){state.visible=true;this.synchronize();}},
    hide(){const state=states.get(this);if(state){state.visible=false;this.synchronize();}},
    resize(){this.mount();},
  },
  methods:{
    mount(){
      const state=states.get(this);if(!state?.alive||this.properties.covered)return;state.tap=undefined;state.orbit.cancel();const epoch=++state.epoch;
      state.scene?.dispose();state.scene=undefined;
      this.createSelectorQuery().select('#room-canvas').fields({node:true,size:true,rect:true},result=>{
        if(!state.alive||epoch!==state.epoch)return;
        try{
          if(!result?.node||!result.width||!result.height)throw new Error('场景节点尚未就绪');
          state.width=result.width;state.left=result.left??0;state.top=result.top??0;
          state.scene=new HomeRoomScene(result.node,result.width,result.height,wx.getWindowInfo().pixelRatio,state.orbit.yaw);
          state.scene.setWeaponLevel(this.properties.weaponLevel);
          this.setData({error:false});this.synchronize();
        }catch{this.setData({error:true});}
      }).exec();
    },
    synchronize(){
      const state=states.get(this);if(!state?.alive)return;
      if(this.properties.covered||this.properties.paused||!state.visible){state.tap=undefined;state.orbit.cancel();}
      if(this.properties.covered){
        if(state.scene)this.setData({frozenFrame:state.scene.capture()});
        state.epoch++;state.scene?.dispose();state.scene=undefined;
        return;
      }
      if(!state.scene){wx.nextTick(()=>{if(state.alive&&!this.properties.covered&&!state.scene)this.mount();});return;}
      state.scene.setActive(state.visible&&!this.properties.paused);
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
        &&state.scene?.hitHero(touch.clientX-state.left,touch.clientY-state.top))this.triggerEvent('herotap');
    },
    touchCancel(){const state=states.get(this);if(state){state.tap=undefined;state.orbit.cancel();}},
    stopTap(){},
    retry(){this.mount();},
  },
});
