declare module "*.mp3" {
  const src: string;
  export default src;
}

declare module 'aframe-react' {
import * as React from 'react';
import { Component } from 'react';

export class Scene extends Component<any, any> {}
export class Entity extends Component<any, any> {}
}
