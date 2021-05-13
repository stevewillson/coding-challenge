import moment from 'moment-timezone'
import _ from 'lodash'

const MAX_BUCKETS = 50

class TimeService {
  getScaledTimeByTimeScale (timeScale, time, timezone) {
    timezone = timezone || 'Etc/UTC'
    if (time == null) { time = moment().tz(timezone) }
    if (time instanceof Date || typeof time === 'string') {
      time = moment(time).tz(timezone)
    }
    if (timeScale === 'all') {
      return 'ALL:ALL'
    } else if (timeScale === 'day') {
      return 'DAY:' + time.format('YYYY-MM-DD')
    } else if (timeScale === 'biweek') {
      // 1 - 26 instead of 1 - 52
      return 'BIWK:' + time.format('GGGG') + (parseInt(time.format('GGGG-WW')) / 2)
    } else if (timeScale === 'week') {
      return 'WK:' + time.format('GGGG-WW')
    } else if (timeScale === 'month') {
      return 'MON:' + time.format('YYYY-MM')
    } else if (timeScale === 'year') {
      return 'YR:' + time.format('YYYY')
    } else {
      return 'MIN:' + time.format('YYYY-MM-DD HH:mm')
    }
  }

  getPreviousTimeByTimeScale (timeScale, time, timezone) {
    timezone = timezone || 'Etc/UTC'
    if (time == null) { time = moment().tz(timezone) }
    if (time instanceof Date || typeof time === 'string') {
      time = moment(time).tz(timezone)
    }
    if (timeScale === 'all') {
      return 'ALL:ALL'
    } else if (timeScale === 'day') {
      time.subtract(1, 'days')
      return 'DAY:' + time.format('YYYY-MM-DD')
    } else if (timeScale === 'biweek') {
      time.subtract(2, 'weeks')
      return 'BIWK:' + time.format('GGGG') + (parseInt(time.format('GGGG-WW')) / 2)
    } else if (timeScale === 'week') {
      time.subtract(1, 'weeks')
      return 'WK:' + time.format('GGGG-WW')
    } else if (timeScale === 'month') {
      time.subtract(1, 'months')
      return 'MON:' + time.format('YYYY-MM')
    } else if (timeScale === 'year') {
      time.subtract(1, 'year')
      return 'YR:' + time.format('YYYY')
    } else {
      time.subtract(1, 'minutes')
      return 'MIN:' + time.format('YYYY-MM-DD HH:mm')
    }
  }

  getScaledTimesByTimeScales (timeScales, time, timezone) {
    return _.map(timeScales, (timeScale) =>
      this.getScaledTimeByTimeScale(timeScale, time, timezone)
    )
  }

  getTimeBucketsByScaledTimes (minScaledTime, maxScaledTime, bucketTimeScale) {
    const minTime = this.scaledTimeToUTC(minScaledTime)
    const maxTime = this.scaledTimeToUTC(maxScaledTime)

    return this.getTimeBuckets(minTime, maxTime, bucketTimeScale)
  }

  getTimeBuckets (minTime, maxTime, bucketTimeScale) {
    const startTimeBucket = this.getScaledTimeByTimeScale(bucketTimeScale, minTime)
    const timeBuckets = []
    let endTimeBucket = this.getScaledTimeByTimeScale(bucketTimeScale, maxTime)
    let count = 0
    while (endTimeBucket !== startTimeBucket && count < MAX_BUCKETS) {
      count += 1
      timeBuckets.unshift(endTimeBucket)
      endTimeBucket = this.getPreviousTimeByTimeScale(bucketTimeScale, this.scaledTimeToUTC(endTimeBucket))
    }
    return _.reverse([startTimeBucket].concat(timeBuckets))
  }

  scaledTimeToUTC (scaledTime) {
    const timeScale = scaledTime.match(/([A-Z]+):/)[1]
    const timeStr = scaledTime.replace(`${timeScale}:`, '')
    let date
    if (timeScale === 'ALL') {
      date = new Date()
    } else if (timeScale === 'BIWK') {
      // 1 - 26
      const [year, biweek] = timeStr.split('-')
      const week = biweek * 2
      date = this.getDateOfISOWeek(year, week)
    } else if (timeScale === 'WK') {
      const [year, week] = timeStr.split('-')
      date = this.getDateOfISOWeek(year, week)
    } else { // day, month, minute
      date = new Date(timeStr)
    }
    return this.dateToUTC(date)
  }

  // https://stackoverflow.com/a/16591175
  getDateOfISOWeek (year, week) {
    var simple = new Date(year, 0, 1 + (week - 1) * 7)
    var dow = simple.getDay()
    var ISOweekStart = simple
    if (dow <= 4) {
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1)
    } else {
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay())
    }
    return ISOweekStart
  }

  dateToUTC (date) {
    // return new Date(
    //   date.getUTCFullYear(),
    //   date.getUTCMonth(),
    //   date.getUTCDate(),
    //   date.getUTCHours(),
    //   date.getUTCMinutes(),
    //   date.getUTCSeconds())
    return moment.utc(date).toDate()
  }
}

export default new TimeService()
