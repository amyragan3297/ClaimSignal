# To-Do List Application

A modern, feature-rich to-do list application with local storage persistence, priority levels, filtering, and data export/import capabilities.

## Features

### Core Features
- **Add Tasks**: Create new tasks with text input and priority selection
- **Edit Tasks**: Click the edit button to modify existing tasks
- **Delete Tasks**: Remove individual tasks with confirmation
- **Mark Complete**: Check off tasks when finished
- **Priority Levels**: Set tasks as High, Medium, or Low priority
- **Local Storage**: Automatically saves all tasks to browser storage
- **Persistent Data**: Tasks remain even after page refresh

### Filtering & Organization
- **Filter by Status**: View All, Active, or Completed tasks
- **Filter by Priority**: Show only high-priority tasks
- **Visual Priority Indicators**: Color-coded badges (Red, Yellow, Green)
- **Smart Sorting**: Recently added tasks appear at the top

### Statistics & Progress
- **Task Counter**: Total tasks, Completed, and Active counts
- **Progress Bar**: Visual representation of completion percentage
- **Real-time Updates**: Stats update instantly as you modify tasks
- **Date Display**: Current date shown in header

### Data Management
- **Export Tasks**: Download tasks as JSON file for backup
- **Import Tasks**: Load previously exported tasks from JSON
- **Clear Completed**: Bulk delete all completed tasks
- **Reset All**: Clear entire task list (with confirmation)

### User Interface
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **Modern Dark Theme**: Easy on the eyes with gradient backgrounds
- **Smooth Animations**: Slide-in effects and hover transitions
- **Font Awesome Icons**: Professional icons throughout the app
- **Accessible**: Proper keyboard navigation and semantic HTML

## Getting Started

### Installation
1. Simply open `index.html` in your web browser
2. No installation, build process, or dependencies required
3. Works offline - all data stored locally in browser

### Usage

#### Adding a Task
1. Type your task in the input field
2. Select a priority level (Low, Medium, High)
3. Press Enter or click "Add" button
4. Task appears immediately in the list

#### Managing Tasks
- **Complete**: Click the checkbox to mark task as done
- **Edit**: Click the edit icon to modify the task text
- **Delete**: Click the trash icon to remove the task
- **Undo**: Use browser back button (limited functionality)

#### Filtering Tasks
- **All**: View all tasks regardless of status
- **Active**: Show only incomplete tasks
- **Completed**: Show only finished tasks
- **High Priority**: Show only high-priority tasks

#### Data Operations
- **Export**: Click "Export" to download tasks as JSON file
- **Import**: Click "Import" to load tasks from a JSON file
- **Clear Completed**: Remove all finished tasks at once
- **Reset All**: Delete entire task list (confirmation required)

## File Structure

```
todo-app/
├── index.html          # HTML structure and layout
├── styles.css          # CSS styling and responsive design
├── app.js              # JavaScript functionality and logic
└── README.md           # Documentation
```

## Technical Details

### Local Storage
- Tasks stored in `localStorage['todos']`
- Automatic save after each action
- Data persists across browser sessions
- No server or database required

### Data Format
```json
[
  {
    "id": 1234567890,
    "text": "Complete project report",
    "completed": false,
    "priority": "high",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "dueDate": null
  }
]
```

### Browser Compatibility
- **Chrome/Chromium**: ✅ Full support (recommended)
- **Firefox**: ✅ Full support
- **Safari**: ✅ Full support
- **Edge**: ✅ Full support
- **IE 11**: ❌ Not supported (uses modern JavaScript)

### Storage Limits
- Most browsers allow 5-10MB of localStorage
- One task ≈ 200-300 bytes
- Should support 10,000+ tasks on most devices

## Keyboard Shortcuts
- **Enter** (in input): Add new task
- **Tab**: Navigate between filter buttons
- **Space**: Activate focused button
- **Click**: Interact with specific tasks

## Tips & Tricks

### Organizing Tasks
1. Use High priority for urgent/important tasks
2. Set Medium for regular, scheduled tasks
3. Use Low for optional or nice-to-have items
4. Regularly clear completed tasks to stay focused

### Backup Strategy
1. Export tasks monthly to JSON file
2. Save exports to cloud storage (Google Drive, Dropbox, etc.)
3. Import previous exports to restore data if needed
4. Keep multiple backups for important projects

### Productivity Tips
1. Create new tasks immediately when they come to mind
2. Review completed tasks for motivation
3. Use priority levels strategically
4. Set realistic goals - don't overload
5. Complete high-priority tasks first

## Customization

### Change Color Scheme
Edit the CSS variables in `styles.css`:
```css
:root {
    --primary-color: #667eea;        /* Main theme color */
    --success-color: #48bb78;        /* Complete/success color */
    --danger-color: #f56565;         /* Delete/danger color */
    /* ... more variables ... */
}
```

### Modify Priority Colors
```css
--high-priority: #ff6b6b;      /* Red */
--medium-priority: #ffd93d;    /* Yellow */
--low-priority: #6bcf7f;       /* Green */
```

## Future Enhancements

Potential features for future versions:
- [ ] Due dates with reminders
- [ ] Task categories/tags
- [ ] Recurring tasks
- [ ] Time tracking for tasks
- [ ] Notes/descriptions per task
- [ ] Subtasks
- [ ] Search functionality
- [ ] Dark/Light theme toggle
- [ ] Cloud sync (Firebase, etc.)
- [ ] Drag & drop reordering
- [ ] Notifications/alarms
- [ ] Pomodoro timer integration
- [ ] Habit tracking

## Troubleshooting

### Tasks Not Saving
- Check browser's localStorage is enabled
- Clear browser cache and try again
- Ensure you have storage space available
- Try a different browser

### Lost All Tasks
- Check if tasks are in browser cache
- Try importing a previously exported JSON file
- Restore browser history if available
- Unfortunately, no recovery if not backed up

### Import Not Working
- Ensure JSON file is properly formatted
- File should contain array of task objects
- Check file isn't corrupted
- Try exporting a task to see correct format

## Performance

- **Fast**: Handles 1000+ tasks smoothly
- **Lightweight**: Only ~15KB total with dependencies
- **Responsive**: Instant feedback on all actions
- **Efficient**: Minimal DOM manipulation and re-renders

## Browser DevTools Tips

View all tasks in console:
```javascript
JSON.parse(localStorage.getItem('todos'))
```

Clear all tasks programmatically:
```javascript
localStorage.removeItem('todos')
```

Add test tasks:
```javascript
const todos = [{id: Date.now(), text: "Test", completed: false, priority: "high", createdAt: new Date().toISOString()}];
localStorage.setItem('todos', JSON.stringify(todos))
```

## License
This project is open source and available for personal and commercial use.

## Notes
- All data stored locally in your browser
- No accounts or login required
- No data sent to any servers
- Complete privacy and data control
- Works offline completely
- Perfect for personal task management

## Support

For issues or suggestions:
1. Check this documentation first
2. Review your browser console for errors
3. Try clearing cache and reloading
4. Test in a different browser
5. Export data before trying fixes
