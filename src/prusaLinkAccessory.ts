import { AccessoryConfig, API, Logger, Service } from 'homebridge';
import fetch from 'node-fetch';
import {Headers} from 'node-fetch';
import { Paths, PrinterStates } from './values';

export class PrusaLinkAccessory {

  private readonly baseURL = Paths.Http + this.config.ip;

  private readonly motionSensorService: Service;
  private readonly informationService: Service;
  private readonly batteryService: Service;

  private readonly bedTemperatureService: Service;
  private readonly nozzleTemperatureService: Service;

  private readonly leakSensorService: Service;

  private readonly hotEndFanService: Service;
  private readonly printFanService: Service;

  private lastState: PrinterStates = PrinterStates.OFFLINE;

  constructor(
    private readonly log: Logger,
    private readonly config: AccessoryConfig,
    private readonly api: API) {

    // Motion Sensor
    this.motionSensorService = new this.api.hap.Service.MotionSensor();
    let remainingDurationCharacteristic = this.motionSensorService.getCharacteristic(api.hap.Characteristic.RemainingDuration);
    remainingDurationCharacteristic.setProps({
      maxValue: 86400  
    });


    // Battery
    this.batteryService = new this.api.hap.Service.Battery();


    // Bed Temperature
    this.bedTemperatureService = new this.api.hap.Service.TemperatureSensor();
    this.bedTemperatureService.subtype = 'Bed Temperature';
    this.bedTemperatureService
      .setCharacteristic(api.hap.Characteristic.Name, 'Bed Temperature');
    let currentBedTemperatureCharacteristic = this.bedTemperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature);
    currentBedTemperatureCharacteristic.setProps({
      minValue: 0.0,
      maxValue: 120.0      
    });
    

    // Bed Target Temperature
    let targetBedTemperatureCharacteristic = this.bedTemperatureService.getCharacteristic(api.hap.Characteristic.TargetTemperature);
    targetBedTemperatureCharacteristic.setProps({
        minValue: 0.0,
        maxValue: 100.0,
        //perms: [api.hap.Characteristic.Perms.NOTIFY, api.hap.Characteristic.Perms.PAIRED_READ]
    });


    // Nozzle Temperature
    this.nozzleTemperatureService = new this.api.hap.Service.TemperatureSensor();
    this.nozzleTemperatureService.subtype = 'Nozzle Temperature';
    this.nozzleTemperatureService
      .setCharacteristic(api.hap.Characteristic.Name, 'Nozzle Temperature');

    let currentNozzleTemperatureCharacteristic = this.nozzleTemperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature);
    currentNozzleTemperatureCharacteristic.setProps({
        minValue: 0.0,
        maxValue: 300.0    
    });


    // Nozzle Target Temperature
    let targetNozzleTemperatureCharacteristic = this.nozzleTemperatureService.getCharacteristic(api.hap.Characteristic.TargetTemperature);
    targetNozzleTemperatureCharacteristic.setProps({
        minValue: 0.0,
        maxValue: 300.0,
        //perms: [api.hap.Characteristic.Perms.NOTIFY, api.hap.Characteristic.Perms.PAIRED_READ]
    });


    // Leak Sensor 
    this.leakSensorService = new this.api.hap.Service.LeakSensor();  
    this.leakSensorService
      .setCharacteristic(api.hap.Characteristic.Name, 'Printer Error');

    // HotEnd Fan 
    this.hotEndFanService = new this.api.hap.Service.Fanv2();
    this.hotEndFanService.subtype = 'HotEnd Fan';
    this.hotEndFanService
      .setCharacteristic(api.hap.Characteristic.Name, 'HotEnd Fan');
    
    let hotEndFanActiveCharacteristic = this.hotEndFanService.getCharacteristic(api.hap.Characteristic.Active);
    hotEndFanActiveCharacteristic.setProps({
        perms: [api.hap.Characteristic.Perms.NOTIFY, api.hap.Characteristic.Perms.PAIRED_READ]
    });
    let hotEndFanRotationSpeedCharacteristic = this.hotEndFanService.getCharacteristic(api.hap.Characteristic.RotationSpeed);
    hotEndFanRotationSpeedCharacteristic.setProps({
        perms: [api.hap.Characteristic.Perms.NOTIFY, api.hap.Characteristic.Perms.PAIRED_READ]
    });    


    // Printer Fan 
    this.printFanService = new this.api.hap.Service.Fanv2();
    this.printFanService.subtype = 'Print Fan';
    this.printFanService
      .setCharacteristic(api.hap.Characteristic.Name, 'Print Fan');   
      
    let printFanActiveCharacteristic = this.printFanService.getCharacteristic(api.hap.Characteristic.Active);
    printFanActiveCharacteristic.setProps({
        perms: [api.hap.Characteristic.Perms.NOTIFY, api.hap.Characteristic.Perms.PAIRED_READ]
    });
    let printFanRotationSpeedCharacteristic = this.printFanService.getCharacteristic(api.hap.Characteristic.RotationSpeed);
    printFanRotationSpeedCharacteristic.setProps({
        perms: [api.hap.Characteristic.Perms.NOTIFY, api.hap.Characteristic.Perms.PAIRED_READ]
    });      

    // Information Service
    this.informationService = new this.api.hap.Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(api.hap.Characteristic.Manufacturer, this.config.manufacturer)
      .setCharacteristic(api.hap.Characteristic.SerialNumber, this.config.serialnumber)
      .setCharacteristic(api.hap.Characteristic.Model, this.config.model);

    // Refresh state every 10 seconds
    setInterval(() => {
      this.refreshState();
    }, 10000);
  }

  private async refreshState() {
    let state = PrinterStates.OFFLINE;
    let completion = 1;
    let temperatureBed = 0;
    let temperatureNozzle = 0;

    let targetTemperatureBed = 0;
    let targetTemperatureNozzle = 0;

    let remainingDuration = 0;

    let printerStatusOK = !true;
    
    let hotEndFanRPM = 0;
    let printFanRPM = 0;

    let requestHeaders = new Headers();
    requestHeaders.append('Accept', 'application/json');

    try {
      if (this.config.auth == 'api-key') {
        requestHeaders.append('X-Api-Key', this.config.apikey);
      } else if (this.config.auth == 'basic') {
        requestHeaders.append('Authorization', 'Basic ' + Buffer.from(this.config.username + ':' + this.config.password).toString('base64'));
      } else if (this.config.auth == 'none') {
      }  

      const response = await fetch(this.baseURL + Paths.StatusPath, {
        method: 'GET',
        headers: requestHeaders,
      });      

      const body = await response.json();
      
      completion = body.job.progress;
      remainingDuration = body.job.time_remaining;
      
      state = body.printer.state;

      temperatureBed = body.printer.temp_bed;
      temperatureNozzle = body.printer.temp_nozzle;

      targetTemperatureBed = body.printer.target_bed;
      targetTemperatureNozzle = body.printer.target_nozzle;

      printerStatusOK = !body.printer.status_printer.ok;

      hotEndFanRPM = body.printer.fan_hotend;
      printFanRPM = body.printer.fan_print;
      
      // console.log(body);

    } catch (err) {
      // do nothing -> standard values will be set
      this.log.error(`${this.config.name} Error: ${err}`);
    }

    this.updateMotionDetected(state);
    this.updateRemainingDuration(remainingDuration);
    this.updateBatteryLevel(completion);
    this.updateTemperatureBed(temperatureBed);
    this.updateTemperatureNozzle(temperatureNozzle);
    this.updateBedTargetTemperature(targetTemperatureBed);
    this.updateNozzleTargetTemperature(targetTemperatureNozzle);
    this.updateLeakDetected(printerStatusOK);
    this.updateHotEndFan(hotEndFanRPM);
    this.updatePrintFan(printFanRPM);
  }

  private updateMotionDetected(state: PrinterStates) {
    let motion = false;

    if(this.lastState === PrinterStates.PRINTING && state === PrinterStates.OPERATIONAL) {
      motion = true;
      this.log.info(`${this.config.name} finished printing!`);
    }

    this.lastState = state;
    this.motionSensorService.updateCharacteristic(this.api.hap.Characteristic.MotionDetected, motion);

    this.log.debug(`${this.config.name} is ${state}`);
  }

  private updateRemainingDuration(remaining: number) {
    this.motionSensorService.updateCharacteristic(this.api.hap.Characteristic.RemainingDuration, remaining);

    this.log.debug(`${this.config.name} Remaining Duration: ${remaining}`);
  }   

  private updateBatteryLevel(completion: number) {
    // const completionInPercent = Math.round(completion * 100);
    this.batteryService.updateCharacteristic(this.api.hap.Characteristic.BatteryLevel, completion);

    this.log.debug(`${this.config.name} Progress: ${completion}`);
  }

  private updateTemperatureBed(temperature: number) {
    this.bedTemperatureService.updateCharacteristic(this.api.hap.Characteristic.CurrentTemperature, temperature);

    this.log.debug(`${this.config.name} Bed Temperature: ${temperature}`);
  }  

  private updateBedTargetTemperature(temperature: number) {
    this.bedTemperatureService.updateCharacteristic(this.api.hap.Characteristic.TargetTemperature, temperature);

    this.log.debug(`${this.config.name} Target Bed Temperature: ${temperature}`);
  }

  private updateNozzleTargetTemperature(temperature: number) {
    this.nozzleTemperatureService.updateCharacteristic(this.api.hap.Characteristic.TargetTemperature, temperature);

    this.log.debug(`${this.config.name} Target Nozzle Temperature: ${temperature}`);
  }

  private updateTemperatureNozzle(temperature: number) {
    this.nozzleTemperatureService.updateCharacteristic(this.api.hap.Characteristic.CurrentTemperature, temperature);

    this.log.debug(`${this.config.name} Nozzle Temperature: ${temperature}`);
  }  

  private updateLeakDetected(leakDetected: boolean) {
    this.leakSensorService.updateCharacteristic(this.api.hap.Characteristic.LeakDetected, leakDetected);

    this.log.debug(`${this.config.name} Leak Detected: ${leakDetected}`);
  }   

  private updateHotEndFan(rpm: number) {
    let activeState = false;
    let rotationSpeed = 0;
    if (rpm > 0) {
      activeState = true;
      rotationSpeed = Math.round((rpm * 100) / this.config.maxHotEndFanRpm);      
    }
    this.hotEndFanService.updateCharacteristic(this.api.hap.Characteristic.Active, activeState);
    this.hotEndFanService.updateCharacteristic(this.api.hap.Characteristic.RotationSpeed, rotationSpeed);

    this.log.debug(`${this.config.name} Hot End Fan: ${activeState} - RPM: ${rpm} - Rotation Speed: ${rotationSpeed}`);
  }     

  private updatePrintFan(rpm: number) {
    let activeState = false;
    let rotationSpeed = 0;
    if (rpm > 0) {
      activeState = true;
      rotationSpeed = Math.round((rpm * 100) / this.config.maxPrintFanRpm);
    }
    this.printFanService.updateCharacteristic(this.api.hap.Characteristic.Active, activeState);
    this.printFanService.updateCharacteristic(this.api.hap.Characteristic.RotationSpeed, rotationSpeed);

    this.log.debug(`${this.config.name} Print Fan: ${activeState} - RPM: ${rpm} - Rotation Speed: ${rotationSpeed}`);
  }     

  public getServices(): Service[] {
    return [
      this.informationService,
      this.motionSensorService,
      this.batteryService,      
      this.bedTemperatureService,
      this.nozzleTemperatureService,
      this.leakSensorService,
      this.hotEndFanService,
      this.printFanService,
    ];
  }
}