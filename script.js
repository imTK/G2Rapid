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

function convertGCodeToRAPID(gcode, moduleName) {
  const rapid = [];
  rapid.push(`MODULE ${moduleName}\n\n`);
  rapid.push('PROC Path_01()\n');

  let useJointMove = false;
  let insideFcpressl = false;
  const fcpresslCommands = [];

  // Declare the x, y, z, q1, q2, and q3 variables here
  let x, y, z, q1, q2, q3;

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
    rapid.push(`  ${fcpresslCommand}\n`);
  }

  // Write out the end of the RAPID module and return the code
  rapid.push('ENDPROC\n\n');
  rapid.push('ENDMODULE\n');
  return rapid.join('');
}


function translateGToRAPID(gCode) {
  // Get the module name from the G code
  let moduleName = '';
  const lines = gCode.split('\n');
  for (let line of lines) {
    const [command, value] = parseGCodeLine(line) || [];
    if (command === 'PARTNO') {
      moduleName = value;
      break;
    }
  }

  // Convert the G code to RAPID and return the result
  return convertGCodeToRAPID(gCode, moduleName);
}

let modContent = ""; // Declare modContent at the beginning of the script

function translateAndDisplayRAPID() {
  const gCode = document.getElementById("fileContents").textContent;
  if (gCode) {
    const rapidCode = translateGToRAPID(gCode);
    const rapidCodePre = document.createElement("pre");
    rapidCodePre.textContent = rapidCode;
    document.getElementById("rapidContents").innerHTML = "";
    document.getElementById("rapidContents").appendChild(rapidCodePre);

    modContent = rapidCode; // Set modContent to the generated RAPID code
  }
}



function readFiles() {
  var files = document.getElementById("fileInput").files;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var reader = new FileReader();
    reader.onload = function(e) {
      var fileContent = document.createElement("pre");
      fileContent.textContent = e.target.result;
      document.getElementById("fileContents").appendChild(fileContent);
    }
    reader.readAsText(file);
  }
}

function clearFiles() {
	document.getElementById("fileInput").value = null;
	document.getElementById("fileContents").innerHTML = "";
	document.getElementById("rapidContents").innerHTML = "";
	modContent = ""; // reset modContent
	rapidContent = ""; // reset rapidContent
}

function downloadMod() {
	if (modContent) {
		var blob = new Blob([modContent], { type: "text/plain" });
		var url = URL.createObjectURL(blob);
		var link = document.createElement("a");
		link.href = url;
		link.download = "output.mod";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
}