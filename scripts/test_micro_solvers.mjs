#!/usr/bin/env node
import {
  solveChineseArithmetic,
  solveSetQuantifierFromText,
  solveSyllogismFromText,
  solveTransitiveComparisonFromText,
  solveWeekdayOffset
} from "../web/micro_solvers.js";

const cases = [
  ["arithmetic", "小明有3个苹果，又买了2个，吃掉1个，还剩几个？", solveChineseArithmetic, 4],
  ["arithmetic", "12减4再加9等于多少？", solveChineseArithmetic, 17],
  ["arithmetic", "5个箱子每个2本书，一共几本？", solveChineseArithmetic, 10],
  ["arithmetic", "8块饼平均分给2个人，每人几块？", solveChineseArithmetic, 4],
  ["weekday", "今天周一，三天后周几？", solveWeekdayOffset, "周四"],
  ["arithmetic", "十加二等于多少？", solveChineseArithmetic, 12],
  ["arithmetic", "三乘四等于多少？", solveChineseArithmetic, 12],
  ["arithmetic", "20除以5等于多少？", solveChineseArithmetic, 4],
  ["arithmetic", "有10个球，拿走4个，再拿走3个，还剩多少？", solveChineseArithmetic, 3],
  ["arithmetic", "2乘3再加4等于多少？", solveChineseArithmetic, 10],
  ["transitive", "A比B高，B比C高，谁最高？", solveTransitiveComparisonFromText, "A"],
  ["transitive", "甲比乙早，乙比丙早，谁最后？", solveTransitiveComparisonFromText, "丙"],
  ["transitive", "X比Y重，Y比Z重，谁最轻？", solveTransitiveComparisonFromText, "Z"],
  ["transitive", "A最薄，B比A厚，C比B厚，哪本最厚？", solveTransitiveComparisonFromText, "C"],
  ["transitive", "小红比小明快，小明比小李快，谁最慢？", solveTransitiveComparisonFromText, "小李"],
  ["transitive", "A>B, B>C, C>D, 谁最大？", solveTransitiveComparisonFromText, "A"],
  ["transitive", "A比B短，B比C短，谁最长？", solveTransitiveComparisonFromText, "C"],
  ["syllogism", "所有会飞的都不是鱼，小鸟会飞，小鸟是鱼吗？", solveSyllogismFromText, false],
  ["syllogism", "所有A都是B，所有B都是C，所以所有A都是C吗？", solveSyllogismFromText, true],
  ["syllogism", "没有鸟是鱼，麻雀是鸟，麻雀是鱼吗？", solveSyllogismFromText, false],
  ["syllogism", "所有学生都会读书，小王是学生，小王会读书吗？", solveSyllogismFromText, true],
  ["syllogism", "所有红色球都不是蓝色球，这个球是红色球，它是蓝色球吗？", solveSyllogismFromText, false],
  ["syllogism", "所有猫都不是鸟，咪咪是猫，咪咪是鸟吗？", solveSyllogismFromText, false],
  ["syllogism", "如果所有会游泳的都是动物，鲸鱼会游泳，鲸鱼是动物吗？", solveSyllogismFromText, true],
  ["set", "所有X都是Y，Z是X，Z是Y吗？", solveSetQuantifierFromText, true],
  ["set", "没有A是B，C是A，C是B吗？", solveSetQuantifierFromText, false]
];

const failures = [];
for (const [kind, prompt, fn, expected] of cases) {
  const result = fn(prompt);
  const actual = result.result;
  if (!result.ok || actual !== expected) {
    failures.push({ kind, prompt, expected, result });
  }
}

const cycle = solveTransitiveComparisonFromText("A>B, B>A, 谁最大？");
if (cycle.ok || cycle.error !== "cycle_detected") failures.push({ kind: "transitive", prompt: "cycle", expected: "cycle_detected", result: cycle });

const unknown = solveChineseArithmetic("三只猫比两只狗更可爱吗？");
if (unknown.ok) failures.push({ kind: "arithmetic", prompt: "unsupported", expected: "ok:false", result: unknown });

console.log("micro solver test summary");
console.log(`cases: ${cases.length + 2}`);
console.log(`failures: ${failures.length}`);

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(2);
}
