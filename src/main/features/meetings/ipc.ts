import { api } from '../../api'
import { appendChunk, createMeetingTasks, deleteMeeting, extractMeeting, listMeetings, modelStatus, moveMeetings, retryMeeting, startModelDownload, startMeeting, stopMeeting, updateMeeting } from './service'

export function registerMeetingsIpc(): void {
  api('meetings:list', () => listMeetings())
  api('meetings:start', (title, taskId) => startMeeting(title, taskId))
  api('meetings:chunk', (id, data) => appendChunk(id, data))
  api('meetings:stop', (id, ms) => stopMeeting(id, ms))
  api('meetings:update', (id, p) => updateMeeting(id, p))
  api('meetings:summarize', (id) => retryMeeting(id, 'summary'))
  api('meetings:retry', (id) => retryMeeting(id, 'auto'))
  api('meetings:delete', (id) => deleteMeeting(id))
  api('meetings:extract', (id) => extractMeeting(id))
  api('meetings:createTasks', (id, tasks) => createMeetingTasks(id, tasks))
  api('meetings:modelStatus', () => modelStatus())
  api('meetings:downloadModel', () => startModelDownload())
  api('meetings:moveTo', (dest) => moveMeetings(dest))
}
