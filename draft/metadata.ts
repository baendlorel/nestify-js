function classdec(target: any, context: ClassDecoratorContext) {
  console.log('注册了类装饰器');
  context.metadata!['类的装饰器'] = true;
}

function methoddec(target: any, context: ClassMethodDecoratorContext) {
  console.log('注册了方法装饰器');
  context.metadata!['类方法的装饰器'] = true;
}

@classdec
class A {
  @methoddec
  func() {}
}

console.log('A', A);
const s = Reflect.ownKeys(A).find((v) => typeof v === 'symbol')!;
console.log(s, s.description, s === Symbol.for('Symbol.metadata'));

// 输出：
//
// 注册了方法装饰器
// 注册了类装饰器
// A [class A] {
//   Symbol(Symbol.metadata): [Object: null prototype] { '类方法的装饰器': true, '类的装饰器': true }
// }
// Symbol(Symbol.metadata) Symbol.metadata true
