# Clipboard Report

The function of this plugin is to publish your clipboard data.

Using this plugin means you give up your privacy. So please be careful.

# How to use

Register the MIME types of interest via dbus and set the corresponding FDs.

	io.github.q962
		/io/github/q962/ClipboardReport
			io.github.q962.ClipboardReport
				register(string[])
					When providing mimetype, you also need to set fd_list.
					All data will be written to fd_list[0]
				unregister(string[])
					Remove the corresponding mimetype.
					Empty means remove all.
				set(string)
					Set clipboard by mimetype.
					Using the content from fd_list[0].

## Data Format

data prefix
```
MimeType-Count: ${mimetype_count}; Content-Length: ${data_length}\r\n\r\n
MimeType: ${mimetype}; Content-Length: ${mimetype_data.length}\r\n\r\n
...
```

