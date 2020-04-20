// ==UserScript==
// @name         课表助手 - xtu
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  一键导出课表为ics文件
// @author       DeltaX
// @match        http://jwxt.xtu.edu.cn/jsxsd/xskb/xskb_list.do
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.min.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  // 设置上课时间及下课时间
  let class_start_summer = [[], [8, 0], [10, 10], [14, 30], [16, 40], [19, 30]];
  let class_start_winter = [[], [8, 0], [10, 10], [14, 0], [16, 10], [19, 0]];
  let class_time = 100;
  // let weekToNum = { "日": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6 }
  let weekRegexp = /(?:(\d{1,2}-\d{1,2})|(\d{1,2})\(单周\))/g
  let nowDate = new Date();
  let weekStartQuery = (term) => new Promise(function (resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://jwxt.xtu.edu.cn/jsxsd/jxzl/jxzl_query');
    xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    xhr.withCredentials = true;
    xhr.onload = function () {
      if (xhr.status === 200) {
        resolve(/<tr height='28'><td>1<\/td><td title='(.*?)'>/.exec(this.response)[1])
      } else {
        reject(this)
      }
    };
    xhr.send("xnxq01id=" + term);
  });

  // 窗口加载完成调用函数
  window.onload = function () {
    try {
      // 获取main-->page_iframe-->iframe0
      let iframe0 = document.getElementById("Form1");
      // 添加按钮"保存ics"
      let button = iframe0.querySelector('input[value="打 印"]');
      button.outerHTML += '<input type="button" onclick="saveics()" class="button" style="margin: 0 5px" name="submit" value="保存ics">';
      if (typeof iframe0.saveics === "function") return;
      // 添加按钮操作，核心部分
      window.console.log("开始生成...");
      iframe0.saveics = function () {
        if (navigator.userAgent.indexOf('MISE') > -1 && navigator.userAgent.indexOf('MSIE 10') == -1) {
          alert('浏览器不支持哦~😆');
          return;
        }
        let SEPARATOR = (navigator.appVersion.indexOf('Win') !== -1) ? '\r\n' : '\n';
        let calendar_start = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:Curriculum-to-iCalendar'
        ].join(SEPARATOR);
        let calendar_end = SEPARATOR + 'END:VCALENDAR' + SEPARATOR;
        let calendarEvents = [];
        // 获取到课程表
        try {
          let table = document.querySelector("#kbtable").tBodies[0];
          let yearTerm = document.querySelector("#xnxq01id")[document.querySelector("#xnxq01id").selectedIndex].innerText.split("-");
          let year = yearTerm[0] + "-" + yearTerm[1];
          let term = yearTerm[2];
          // 请求起始周
          console.log("查询学期起始日期中，学期: " + yearTerm.join("-"));
          weekStartQuery(yearTerm.join("-")).then(weekStart => {
            let termStartDate = new Date(weekStart.split(/年|月|日/));
            // let currentWeek = parseInt((nowDate - startDate) / 1000 * 60 * 60 * 24 * 7);
            let toString = function (date) {
              return date.toISOString().split(/-|:|[.]/).slice(0, 4).join("") + "00Z";
            }
            // 逐行添加event至cal
            console.log("添加课程事件中...");
            for (let i = 1; i < table.rows.length - 1; i++) {
              // 逐课程添加
              // let timeAddress = table.rows[i].cells[0].innerText;
              // let events = timeAddress.split(' ').filter(n => n != " ");
              for (let j = 1; j < table.rows[i].cells.length; j++) {

                // TODO 同一时间不同课程
                let lessonInfos = table.rows[i].cells[j].innerText.split("---------------------\n")
                for (let lesInfStr of lessonInfos) {
                  let lessonInfo = lesInfStr.split("\n").filter(n => n !== "");
                  // console.log(lessonInfo);
                  // 空课程跳过
                  if (lessonInfo.length < 4) {
                    continue;
                  }
                  let courseName = lessonInfo[0];
                  let teacherName = lessonInfo[1];
                  // TODO 多周问题 
                  let weeksStr = lessonInfo[2];
                  let location = lessonInfo[3];
                  let description = courseName + " " + teacherName + " ";
                  let weekDay = j;
                  // let interval = parseInt(informations[2]);
                  // TODO 判断夏令时冬令时
                  let isSummerTime = false
                  let startTime = [];
                  let endTime = [];
                  if (isSummerTime) {
                    startTime = class_start_summer[i];
                  } else {
                    startTime = class_start_winter[i];
                  }
                  // 按照多周划分后迭代
                  for (let weekStrs = weekRegexp.exec(weeksStr); weekStrs !== null; weekStrs = weekRegexp.exec(weeksStr)) {

                    // 分多周 "2-5,7-9,11-13(周)" 和单周 "13(单周)"
                    let week = [];
                    if (weekStrs[1] !== undefined) {
                      week = weekStrs[1].split("-") // 多周
                    } else {
                      week = [weekStrs[2], weekStrs[2]] // 单周
                    }
                    let startWeek = parseInt(week[0]);
                    let endWeek = parseInt(week[1]);
                    let startDate = new Date(termStartDate),
                      endDate = new Date(termStartDate),
                      untilDate = new Date(termStartDate);
                    // 课程时间
                    startDate.setDate(startDate.getDate() + (startWeek - 1) * 7 + weekDay - 1);
                    startDate.setHours(startTime[0], startTime[1], 0, 0);
                    endDate.setDate(endDate.getDate() + (startWeek - 1) * 7 + weekDay - 1);
                    endDate.setHours(startTime[0] + parseInt((startTime[1] + class_time) / 60), (startTime[1] + class_time) % 60);
                    // 课程截止
                    untilDate.setDate(untilDate.getDate() + (endWeek - 1) * 7 + weekDay); // 加一天使最后一周有效
                    untilDate.setHours(startTime[0] + parseInt((startTime[1] + class_time) / 60), (startTime[1] + class_time) % 60);
                    calendarEvents.push([
                      'BEGIN:VEVENT',
                      'DTSTAMP:' + toString(nowDate),
                      'UID:' + calendarEvents.length + '@' + 'https://1000delta.top',
                      'SUMMARY:' + courseName,
                      'DTSTART:' + toString(startDate),
                      'DTEND:' + toString(endDate),
                      'RRULE:FREQ=WEEKLY;UNTIL=' + toString(untilDate),
                      'LOCATION:' + location,
                      'DESCRIPTION:' + description,
                      'END:VEVENT'
                    ].join(SEPARATOR));
                  }
                }
              }
            }
            // console.log(calendarEvents);
            if (calendarEvents.length < 1) {
              alert('课表里没课哦~😆');
              return;
            }
            //保存
            let fileName = year + "学年第" + term + "学期.ics";
            let calendar = calendar_start + SEPARATOR + calendarEvents.join(SEPARATOR) + calendar_end;
            let blob;
            if (navigator.userAgent.indexOf('MSIE 10') === -1) { // chrome or firefox
              blob = new Blob([calendar]);
            } else { // ie
              let bb = new BlobBuilder();
              bb.append(calendar);
              blob = bb.getBlob('text/x-vCalendar;charset=' + document.characterSet);
            }
            saveAs(blob, fileName);
          });
        } catch (error) {
          console.log(error);
          alert("出错啦！/(ㄒoㄒ)/~~");
        }
      }
    } catch (error) {
      if (error.message !== window.error_message) {
        window.error_message = error.message;
        console.log(error);
      }
      return;
    }
  };
  // 保证页面刷新后重新执行
  // setInterval(onload, 50);
})();