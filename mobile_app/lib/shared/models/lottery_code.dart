enum LotteryCode {
  dlt('dlt', '超级大乐透'),
  pl3('pl3', '排列3'),
  pl5('pl5', '排列5');

  const LotteryCode(this.code, this.label);

  final String code;
  final String label;
}
