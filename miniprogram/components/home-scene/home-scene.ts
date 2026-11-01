import { HomeRoomScene } from '../../home/room-scene';
interface State { scene?: HomeRoomScene; visible: boolean; alive: boolean; epoch: number }
const states=new WeakMap<object,State>();
Component({
  properties:{ paused:{type:Boolean,value:false,observer(){this.synchronize();}},covered:{type:Boolean,value:false,observer(){this.synchronize();}} },
  data:{frozenFrame:'',error:false},
  lifetimes:{
    attached(){states.set(this,{visible:true,alive:true,epoch:0});},
    ready(){this.mount();},
    detached(){const state=states.get(this);if(state){state.alive=false;state.epoch++;state.scene?.dispose();}states.delete(this);},
  },
  pageLifetimes:{
    show(){const state=states.get(this);if(state){state.visible=true;this.synchronize();}},
    hide(){const state=states.get(this);if(state){state.visible=false;this.synchronize();}},
    resize(){this.mount();},
  },
  methods:{
    mount(){
      const state=states.get(this);if(!state?.alive||this.properties.covered)return;const epoch=++state.epoch;
      state.scene?.dispose();state.scene=undefined;
      this.createSelectorQuery().select('#room-canvas').fields({node:true,size:true},result=>{
        if(!state.alive||epoch!==state.epoch)return;
        try{
          if(!result?.node||!result.width||!result.height)throw new Error('场景节点尚未就绪');
          state.scene=new HomeRoomScene(result.node,result.width,result.height,wx.getWindowInfo().pixelRatio);
          this.setData({error:false});this.synchronize();
        }catch{this.setData({error:true});}
      }).exec();
    },
    synchronize(){
      const state=states.get(this);if(!state?.alive)return;
      if(this.properties.covered){
        if(state.scene)this.setData({frozenFrame:state.scene.capture()});
        state.epoch++;state.scene?.dispose();state.scene=undefined;
        return;
      }
      if(!state.scene){wx.nextTick(()=>{if(state.alive&&!this.properties.covered&&!state.scene)this.mount();});return;}
      state.scene.setActive(state.visible&&!this.properties.paused);
    },
    retry(){this.mount();},
  },
});
