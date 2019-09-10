// Dependencies
const fs = require("fs").promises;
const path = require("path");
const fsSync = require("fs");
const xml2js = require("xml2js");
const moment = require("moment");
const ObjectsToCsv = require("objects-to-csv");
const yargs = require("yargs");

const argv = yargs
    .option('inputPath', {
        alias: 'i',
        description: 'The input folder path for .gpx files. All .gpx files in this path will be parsed. (for example: --inputPath "./gpx")',
        type: 'string',
        demandOption: true
    })
    .option('outputPath', {
        alias: 'o',
        description: 'The output file path to write the results into. (for example: --outputPath "./results.csv")',
        type: 'string',
        default: './results.csv'
    })
    .help()
    .alias('help', 'h')
    .argv;

const inputPath = argv.inputPath;
const resultsPath = argv.outputPath;

// Check that the input path exists
if (!fsSync.existsSync(inputPath)) {
    console.error(`Input path '${inputPath}' does not exist!`);
    return;
}

// Check that the input path is a directory
const stats = fsSync.statSync(inputPath);
if (!stats.isDirectory()) {
    console.error(`Input path '${inputPath}' is not a directory!`);
    return;
}

const gpxFilePaths = fsSync.readdirSync(inputPath).filter(f => f.toLowerCase().endsWith(".gpx"))
    .map(f => path.join(inputPath, f));

console.log(`Found ${gpxFilePaths.length} .gpx files`);
console.log("Start parsing...");

return fs.writeFile(resultsPath, "", "utf8") // Empty results file
    .then(() => fs.appendFile(resultsPath, "Name,Date,Time,Heart Rate\n", "utf8"))
    .then(() => {
        const promisesArray = gpxFilePaths.map(f => parseGpxAndWriteToResults(f, resultsPath));

        return promisesArray.reduce((promiseChain, currentTask) => {
            return promiseChain.then(chainResults => currentTask.then(currentResult => [ ...chainResults, currentResult ]));
        }, Promise.resolve([]));
    })
    .then(() => console.log(`Finished writing results to ${resultsPath}`))
    .catch(err => console.error(err));

function parseGpxAndWriteToResults(filePath, outputFilePath) {
    const parser = new xml2js.Parser({ explicitArray: false });

    return fs.readFile(filePath, 'utf8')
        .then(data => {
            console.log(`Parsing file: ${filePath}`);
            return parser.parseStringPromise(data);
        })
        .then(result => {
            const name = result.gpx.metadata.name;
            const rawData = result.gpx.trk.trkseg.trkpt;

            return rawData.filter(r => r.extensions !== undefined && r.extensions['gpxtpx:TrackPointExtension'] !== undefined).map(r => ({
                name: name,
                date: moment(r.time).locale("fi").format("L"),
                time: moment(r.time).format("HH:mm:ss"),
                hr: r.extensions['gpxtpx:TrackPointExtension']['gpxtpx:hr']
            }));
        })
        .then(data => new ObjectsToCsv(data).toString(false))
        .then(csv => fsSync.appendFileSync(outputFilePath, csv, "utf8"))
}
