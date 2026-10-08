const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const TEMPLATES = [
  {
    id: 'blank', name: 'Blank page', icon: '📄', description: 'Start from scratch.',
    title: '', content: () => '',
  },
  {
    id: 'meeting', name: 'Meeting notes', icon: '🗓️', description: 'Agenda, attendees, notes and action items.',
    title: () => `${today()} Meeting notes`,
    content: () => `<h2>Date</h2><p>${today()}</p><h2>Participants</h2><ul><li><p></p></li></ul><h2>Goals</h2><ul><li><p></p></li></ul><h2>Discussion topics</h2><table><tbody><tr><th><p>Time</p></th><th><p>Item</p></th><th><p>Presenter</p></th><th><p>Notes</p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul><h2>Decisions</h2><ul><li><p></p></li></ul>`,
  },
  {
    id: 'decision', name: 'Decision', icon: '⚖️', description: 'Record an important decision and its context.',
    title: 'Decision: ',
    content: () => `<table><tbody><tr><th><p>Status</p></th><td><p>NOT STARTED / IN PROGRESS / DECIDED</p></td></tr><tr><th><p>Stakeholders</p></th><td><p></p></td></tr><tr><th><p>Outcome</p></th><td><p></p></td></tr><tr><th><p>Due date</p></th><td><p></p></td></tr><tr><th><p>Owner</p></th><td><p></p></td></tr></tbody></table><h2>Background</h2><p></p><h2>Options considered</h2><table><tbody><tr><th><p></p></th><th><p>Option 1</p></th><th><p>Option 2</p></th></tr><tr><th><p>Description</p></th><td><p></p></td><td><p></p></td></tr><tr><th><p>Pros</p></th><td><p></p></td><td><p></p></td></tr><tr><th><p>Cons</p></th><td><p></p></td><td><p></p></td></tr><tr><th><p>Estimated cost</p></th><td><p></p></td><td><p></p></td></tr></tbody></table><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>`,
  },
  {
    id: 'requirements', name: 'Product requirements', icon: '📋', description: 'Define, scope and track requirements.',
    title: 'Requirements: ',
    content: () => `<table><tbody><tr><th><p>Target release</p></th><td><p></p></td></tr><tr><th><p>Epic</p></th><td><p></p></td></tr><tr><th><p>Document status</p></th><td><p>DRAFT</p></td></tr><tr><th><p>Document owner</p></th><td><p></p></td></tr></tbody></table><h2>Goals</h2><ul><li><p></p></li></ul><h2>Background and strategic fit</h2><p></p><h2>Assumptions</h2><ul><li><p></p></li></ul><h2>Requirements</h2><table><tbody><tr><th><p>#</p></th><th><p>Title</p></th><th><p>User story</p></th><th><p>Importance</p></th><th><p>Notes</p></th></tr><tr><td><p>1</p></td><td><p></p></td><td><p></p></td><td><p>Must have</p></td><td><p></p></td></tr></tbody></table><h2>User interaction and design</h2><p></p><h2>Questions</h2><table><tbody><tr><th><p>Question</p></th><th><p>Outcome</p></th></tr><tr><td><p></p></td><td><p></p></td></tr></tbody></table><h2>Not doing</h2><ul><li><p></p></li></ul>`,
  },
  {
    id: 'howto', name: 'How-to article', icon: '🧭', description: 'Step-by-step guidance for your team.',
    title: 'How to ',
    content: () => `<p>Provide a short introduction describing what this article helps the reader do.</p><h2>Instructions</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol><blockquote><p>💡 Tip: add screenshots or code snippets to make steps clear.</p></blockquote><h2>Related articles</h2><ul><li><p></p></li></ul>`,
  },
  {
    id: 'retro', name: 'Retrospective', icon: '🔁', description: 'Reflect on what went well and what to improve.',
    title: () => `Retrospective ${today()}`,
    content: () => `<h2>Participants</h2><ul><li><p></p></li></ul><h2>What went well 👍</h2><ul><li><p></p></li></ul><h2>What could be improved 👎</h2><ul><li><p></p></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>`,
  },
];
