// This function takes a single line of G-Code, trims it, and returns the command and value if it's valid (ignoring comments).
function parseGCodeLine(line) {
  line = line.trim();
  if (!line || line.startsWith(';')) {
    return null;
  }

  const tokens = line.split('/');
  const command = tokens[0].trim();
  const value = tokens.slice(1).join(',') || null;
  return [command, value];
}


// This function converts G-Code text into ABB RAPID code, with the provided module and file name.
function convertGCodeToRAPID(gcode, procName, moduleName) {
  const rapid = [];

  if (!moduleName) {
    moduleName = "Program";
  }

  let useJointMove = false;
  let insideFcpressl = false;
  const fcpresslCommands = [];

  // Declare the x, y, z, q1, q2, and q3 variables here
  let x, y, z, q1, q2, q3;

  // Check if the MODULE statement has already been added
  if (modContent.indexOf(`MODULE ${moduleName}`) === -1) {
    rapid.push(`MODULE ${moduleName}\n\n`);
  }

  rapid.push(`PROC Path_${procName}()\n`);

  for (let line of gcode.split('\n')) {
    const [command, value] = parseGCodeLine(line) || [];

    if (!command) {
      continue;
    }

    if (command === 'RAPID') {
      useJointMove = true;
      if (insideFcpressl) {
        rapid.push(`  FCPressEnd p[${x}, ${y}, ${z}, ${q1}, ${q2}, ${q3}], v1000, z10, force_sensor_object, [0, 0, -10], 10, tool0;\n`);
        insideFcpressl = false;
        fcpresslCommands.length = 0;
      }
    } else if (command === 'GOTO') {
      [x, y, z, q1, q2, q3] = value.split(',');
      let moveCommand;
      if (useJointMove) {
        moveCommand = `MoveJ p[${x}, ${y}, ${z}, ${q1}, ${q2}, ${q3}], v1000, z10, tool0;`;
      } else {
        if (!insideFcpressl) {
          rapid.push(`  FCPressLStart p[${x}, ${y}, ${z}, ${q1}, ${q2}, ${q3}], v1000, z10, force_sensor_object, [0, 0, -10], 10, tool0;\n`);
          insideFcpressl = true;
        }
        moveCommand = `FCPressL p[${x}, ${y}, ${z}, ${q1}, ${q2}, ${q3}], v1000, z10, force_sensor_object, [0, 0, -10], 10, tool0;`;
        fcpresslCommands.push(moveCommand);
      }
      rapid.push(`  ${moveCommand}\n`);
      useJointMove = false;
    } else {
      if (insideFcpressl) {
        continue;
      }
      if (command === 'FEDRAT') {
        rapid.push(`  ${command}: ${value}\n`);
        continue;
      }
      rapid.push(`! ${command}: ${value}\n`);
    }
  }

  // Write out any remaining FCPressL commands
  if (insideFcpressl) {
    rapid.push(`  FCPressLEnd p[${x}, ${y}, ${z}, ${q1}, ${q2}, ${q3}], v1000, z10, force_sensor_object, [0, 0, -10], 10, tool0;\n`);
    insideFcpressl = false;
    fcpresslCommands.length = 0;
  }
  
  // Write out any remaining FCPressL commands in the list
  for (let fcpresslCommand of fcpresslCommands) {
    rapid.push('${fcpresslCommand}\n');
  }

  // Write out the end of the RAPID module and return the code
  rapid.push('ENDPROC\n\n');


return rapid.join("");
}


// Declare modContent to hold the module content for the entire program.
let modContent = ""; 


// This function reads the selected files, converts the G-Code into RAPID code, and appends the result to the modContent variable.
async function readFiles() {
  // Show a prompt for the user to enter the module name
  const moduleName = prompt("Anna moduulin nimi:");

  // If the user presses cancel or doesn't provide a module name, return
  if (!moduleName) {
    alert("Moduulin nimi on pakollinen.");
    return;
  }

  const files = document.getElementById("fileInput").files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileContent = await readFileAsText(file);
    const procName = file.name.replace(/\.[^/.]+$/, "");
    const rapidCode = convertGCodeToRAPID(fileContent, procName, moduleName);

    // Update the DOM with the read file
    const fileContentPre = document.createElement("pre");
    fileContentPre.textContent = fileContent;
    document.getElementById("fileContents").appendChild(fileContentPre);

    // Update the DOM with the converted RAPID code
    const rapidCodePre = document.createElement("pre");
    rapidCodePre.textContent = rapidCode;
    document.getElementById("rapidContents").appendChild(rapidCodePre);

    modContent += rapidCode;

    // Check if this is the last file and append "ENDMODULE" if it is
    if (i === files.length - 1) {
      modContent += "ENDMODULE\n";

      // Append "ENDMODULE" to the preview (the "pre" element) as well
      const endModulePre = document.createElement("pre");
      endModulePre.textContent = "ENDMODULE";
      document.getElementById("rapidContents").appendChild(endModulePre);
    }
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsText(file);
  });
}


// This function clears the file input, resets modContent and rapidContent, and clears the file contents and rapid contents elements.
function clearFiles() {
	document.getElementById("fileInput").value = null;
	document.getElementById("fileContents").innerHTML = "";
	document.getElementById("rapidContents").innerHTML = "";
	modContent = ""; // reset modContent
	rapidContent = ""; // reset rapidContent
}


// This function triggers the download of the generated RAPID code as a .mod file.
function downloadMod() {
	if (modContent) {
		// Get the module name from the modContent
        const moduleNameMatch = modContent.match(/MODULE\s+([^\s]+)/);
		const moduleName = moduleNameMatch ? moduleNameMatch[1] : "output";
		
		var blob = new Blob([modContent], { type: "text/plain" });
		var url = URL.createObjectURL(blob);
		var link = document.createElement("a");
		link.href = url;
		link.download = `${moduleName}.mod`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
}