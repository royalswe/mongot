# mongot

Started Generalnode 26 Mars 2016 - 28 May 2016 as school project.
15 Aug 2016 and forward as private project.

Blockwars started september 2017.

changed name to miniblip.com 13 November 2017.

Changed name to mongot.com 12 December 2022.

Changed name to mongot

# setup PM2

To change the start script of a process managed by PM2, you'll typically follow these steps:

Stop the existing Process:
`pm2 stop [id|name]`
Once stopped, delete the process from PM2's list.
`pm2 delete [id|name]`
Start the New Script:
Navigate to your project's directory and then start the new script using PM2.

cd /path/to/your/project
`pm2 start npm --name "your-app-name" -- run start`

We're using npm as the script to run.
The --name "your-app-name" option lets you set a name for your app.
The -- run start part passes the run start argument to npm.
Save the New State:
If you want to make sure that this new configuration persists across machine restarts, don't forget to save the PM2 configuration.

`pm2 save`
Now, whenever PM2 restarts or the machine reboots (assuming you have PM2's startup script set up), it will use the "npm run start" command for your application.
